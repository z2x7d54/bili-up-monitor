import { creatorDisplayName } from "@/lib/creator-personal";
import { withDataWrite } from "@/lib/data-transfer-lock";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildMonthlyNotificationReport, monthlyNotificationDates, type NotificationInbox, type WeeklyNotification, type WeeklyReport } from "@/lib/weekly";

async function ensureNotification(now: Date) {
  const d = monthlyNotificationDates(now);
  const existing = await prisma.weeklyNotification.findUnique({ where: { weekKey: d.monthKey } });
  if (existing) return existing;
  const [creators, groups, videos, goals] = await prisma.$transaction([
    prisma.upCreator.findMany({ orderBy: [{ groupName: "asc" }, { name: "asc" }] }),
    prisma.creatorGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.contentItem.findMany({ where: { publishedAt: { gte: d.reportStart, lt: d.reportEnd } } }),
    prisma.goalConfig.findMany({ where: { period: "MONTH" } }),
  ]);
  if (!creators.length) return null;
  const report = buildMonthlyNotificationReport(creators, videos, groups.map(g => g.name), now, goals, groups);
  try {
    return await prisma.weeklyNotification.create({ data: { kind: "MONTH", weekKey: d.monthKey, periodStart: d.reportStart, periodEnd: d.reportEnd, payload: JSON.stringify(report), createdAt: now } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return prisma.weeklyNotification.findUniqueOrThrow({ where: { weekKey: d.monthKey } });
  }
}
function serialize(row: { id: string; weekKey: string; readAt: Date | null; payload: string }): WeeklyNotification {
  return { kind: "MONTH", id: row.id, weekKey: row.weekKey, readAt: row.readAt?.toISOString() ?? null, report: JSON.parse(row.payload) as WeeklyReport };
}
export async function ensureMonthlyNotification(now = new Date()) { return withDataWrite(() => ensureNotification(now)); }
export async function ensureReportNotifications(now = new Date()) { return ensureMonthlyNotification(now); }
export async function getNotificationInbox(now = new Date(), page = 1): Promise<NotificationInbox> {
  await ensureReportNotifications(now);
  const month = monthlyNotificationDates(now), pageSize = 12;
  return prisma.$transaction(async tx => {
    const total = await tx.weeklyNotification.count({ where: { kind: "MONTH" } });
    const unreadCount = await tx.weeklyNotification.count({ where: { kind: "MONTH", readAt: null } });
    const safePage = Math.max(1, Math.min(Math.ceil(total / pageSize) || 1, Math.floor(page) || 1));
    const rows = await tx.weeklyNotification.findMany({ where: { kind: "MONTH" }, orderBy: { periodEnd: "desc" }, skip: (safePage - 1) * pageSize, take: pageSize });
    const newAccounts = (await tx.upCreator.findMany({ where: { createdAt: { gte: month.currentStart, lte: now } }, select: { id: true, mid: true, name: true, alias: true, groupName: true, createdAt: true }, orderBy: [{ groupName: "asc" }, { createdAt: "desc" }] })).map(c => ({ ...c, name:creatorDisplayName(c), createdAt: c.createdAt.toISOString() }));
    // Keep the old response keys so saved clients remain compatible.
    return { notifications: rows.map(serialize), total, page: safePage, pageSize, unreadCount, currentWeekKey: month.currentMonthKey, newAccounts, newMonthlyAccounts: newAccounts };
  });
}
export async function claimReportPopups(now = new Date()) {
  if (!monthlyNotificationDates(now).isFirst) return [];
  return withDataWrite(async () => {
    const notification = await ensureNotification(now);
    if (!notification) return [];
    const claimed = await prisma.weeklyNotification.updateMany({ where: { id: notification.id, kind: "MONTH", popupSeenAt: null }, data: { popupSeenAt: now, readAt: now } });
    return claimed.count === 1 ? [serialize({ ...notification, readAt: now })] : [];
  });
}
export async function claimFirstDayPopup(now = new Date()) { return (await claimReportPopups(now))[0] ?? null; }
export async function markNotificationRead(id: string, now = new Date()) { return withDataWrite(() => prisma.weeklyNotification.updateMany({ where: { id, kind: "MONTH", readAt: null }, data: { readAt: now } })); }
export async function markAllNotificationsRead(now = new Date()) {
  return withDataWrite(async () => {
    await ensureNotification(now);
    return prisma.$transaction(async tx => {
      const result = await tx.weeklyNotification.updateMany({ where: { kind: "MONTH", readAt: null }, data: { readAt: now } });
      return { ...result, unreadCount: await tx.weeklyNotification.count({ where: { kind: "MONTH", readAt: null } }) };
    });
  });
}

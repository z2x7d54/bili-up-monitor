import { creatorDisplayName } from "@/lib/creator-personal";
import { goalTargetsSchema, type GoalTargets } from "@/lib/goal-format";
import { businessDates } from "@/lib/monthly";
import { descendantGroupNames, groupHierarchy, type GroupNode } from "@/lib/group-tree";

const DAY = 86_400_000;
export function weeklyDates(now = new Date()) {
  const today = businessDates(now).todayStart;
  const local = new Date(now.getTime() + 8 * 3_600_000);
  const mondayOffset = (local.getUTCDay() + 6) % 7;
  const currentStart = new Date(today.getTime() - mondayOffset * DAY);
  const reportStart = new Date(currentStart.getTime() - 7 * DAY);
  const key = (date: Date) => new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  return { currentStart, reportStart, reportEnd: currentStart, weekKey: key(reportStart), currentWeekKey: key(currentStart), isMonday: mondayOffset === 0 };
}

export function monthlyNotificationDates(now = new Date()) {
  const current = businessDates(now);
  const previous = businessDates(new Date(current.monthStart.getTime() - 1));
  return { currentStart: current.monthStart, reportStart: previous.monthStart, reportEnd: current.monthStart, monthKey: previous.monthKey, currentMonthKey: current.monthKey, isFirst: current.todayStart.getTime() === current.monthStart.getTime() };
}
export function videoCollectionStart(now = new Date()) {
  const start = new Date(businessDates(now).monthStart.getTime() + 8 * 3600000);
  return new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()-5,1)-8*3600000);
}

export type WeeklyMetrics = { posts: number; views: number; likes: number; comments: number; danmaku: number; coins: number; favorites: number; shares: number };
export type WeeklyAccount = WeeklyMetrics & { id: string; mid: string; name: string; followers: number; complete: boolean; addedThisWeek: boolean; collectedAt: string | null; goal?: GoalTargets };
export type WeeklyGroup = WeeklyMetrics & { name: string; accounts: WeeklyAccount[]; pending: number; noPosts: number; path?: string; goalActual?: WeeklyMetrics; goalComplete?: boolean; goal?: GoalTargets };
export type WeeklyReport = {
  kind?: "WEEK" | "MONTH"; weekKey: string; start: string; end: string; generatedAt: string;
  groups: WeeklyGroup[];
  totals: WeeklyMetrics & { accounts: number; groups: number; pending: number; noPosts: number; added: number };
};
export type WeeklyNotification = { kind?: "WEEK" | "MONTH"; id: string; weekKey: string; readAt: string | null; report: WeeklyReport };
export type NewWeeklyAccount = { id: string; mid: string; name: string; groupName: string; createdAt: string };
export type NotificationInbox = { notifications: WeeklyNotification[]; total: number; page: number; pageSize: number; unreadCount: number; currentWeekKey: string; newAccounts: NewWeeklyAccount[]; newMonthlyAccounts?: NewWeeklyAccount[] };

type Creator = { id: string; mid: string; name: string; alias?: string|null; groupName: string; followerCount: number; createdAt: Date; lastVideoSyncAt: Date | null; lastVideoSyncFromAt: Date | null; lastError: string | null };
type Video = { creatorId: string; publishedAt: Date | null; viewCount: number; likeCount: number; replyCount: number; danmakuCount: number; coinCount: number; favoriteCount: number; shareCount: number };
const empty = (): WeeklyMetrics => ({ posts: 0, views: 0, likes: 0, comments: 0, danmaku: 0, coins: 0, favorites: 0, shares: 0 });
const metricKeys: (keyof WeeklyMetrics)[] = ["posts", "views", "likes", "comments", "danmaku", "coins", "favorites", "shares"];
export type ReportGoal = { creatorId: string | null; groupName: string | null; period: string; targets: string; createdAt: Date };
export function buildWeeklyReport(creators: Creator[], videos: Video[], groupNames: string[], now = new Date(), goals: ReportGoal[] = []): WeeklyReport {
  const dates = weeklyDates(now);
  return buildPeriodReport(creators, videos, groupNames, { start: dates.reportStart, end: dates.reportEnd, key: dates.weekKey, kind: "WEEK" }, now, goals);
}
export function buildMonthlyNotificationReport(creators: Creator[], videos: Video[], groupNames: string[], now = new Date(), goals: ReportGoal[] = [], hierarchy: GroupNode[] = []): WeeklyReport {
  const dates = monthlyNotificationDates(now);
  return buildPeriodReport(creators, videos, groupNames, { start: dates.reportStart, end: dates.reportEnd, key: dates.monthKey, kind: "MONTH" }, now, goals, true, hierarchy);
}
export function buildPeriodReport(creators: Creator[], videos: Video[], groupNames: string[], period: { start: Date; end: Date; key: string; kind: "WEEK" | "MONTH" }, now = new Date(), goals: ReportGoal[] = [], historical = true, hierarchy: GroupNode[] = []): WeeklyReport {
  const dates = { reportStart: period.start, reportEnd: period.end, weekKey: period.key };
  const eligibleGoals = goals.filter(g => g.period === period.kind && (!historical || g.createdAt < period.end));
  const accountGoals = new Map(eligibleGoals.filter(g => g.creatorId).map(g => [g.creatorId!, goalTargetsSchema.parse(JSON.parse(g.targets))]));
  const groupGoals = new Map(eligibleGoals.filter(g => g.groupName).map(g => [g.groupName!, goalTargetsSchema.parse(JSON.parse(g.targets))]));
  const byCreator = new Map<string, Video[]>();
  for (const video of videos) {
    if (!video.publishedAt || video.publishedAt < dates.reportStart || video.publishedAt >= dates.reportEnd) continue;
    const list = byCreator.get(video.creatorId) ?? [];
    list.push(video); byCreator.set(video.creatorId, list);
  }
  const groups = new Map<string, WeeklyGroup>();
  for (const name of [...groupNames, ...creators.map(c => c.groupName)]) if (!groups.has(name)) groups.set(name, { name, accounts: [], ...empty(), pending: 0, noPosts: 0 });
  for (const creator of creators) {
    const items = byCreator.get(creator.id) ?? [];
    const account: WeeklyAccount = { id: creator.id, mid: creator.mid, name: creatorDisplayName(creator), followers: creator.followerCount,
      complete: !!creator.lastVideoSyncAt && creator.lastVideoSyncAt >= (historical ? dates.reportEnd : dates.reportStart) && !!creator.lastVideoSyncFromAt && creator.lastVideoSyncFromAt <= dates.reportStart && !creator.lastError,
      addedThisWeek: creator.createdAt >= dates.reportStart && creator.createdAt < dates.reportEnd,
      collectedAt: creator.lastVideoSyncAt?.toISOString() ?? null,
      posts: items.length, views: 0, likes: 0, comments: 0, danmaku: 0, coins: 0, favorites: 0, shares: 0 };
    for (const item of items) {
      account.views += item.viewCount; account.likes += item.likeCount; account.comments += item.replyCount;
      account.danmaku += item.danmakuCount; account.coins += item.coinCount; account.favorites += item.favoriteCount; account.shares += item.shareCount;
    }
    if (accountGoals.has(creator.id)) account.goal = accountGoals.get(creator.id);
    const group = groups.get(creator.groupName)!;
    group.accounts.push(account);
    for (const key of metricKeys) group[key] += account[key];
    if (!account.complete) group.pending++;
    else if (account.posts === 0) group.noPosts++;
  }
  const totals = { ...empty(), accounts: creators.length, groups: groups.size, pending: 0, noPosts: 0, added: 0 };
  for (const group of groups.values()) {
    if (groupGoals.has(group.name)) group.goal = groupGoals.get(group.name);
    group.accounts.sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name, "zh-CN"));
    for (const key of metricKeys) totals[key] += group[key];
    totals.pending += group.pending; totals.noPosts += group.noPosts;
    totals.added += group.accounts.filter(c => c.addedThisWeek).length;
  }
  for (const node of groupHierarchy(hierarchy)) {
    const group = groups.get(node.name);if (!group) continue;
    group.path = node.path;
    if (group.goal) {
      const scope = descendantGroupNames(hierarchy,node.name);
      const accounts = scope.flatMap(name => groups.get(name)?.accounts ?? []);
      group.goalActual = empty();
      for (const account of accounts) for (const key of metricKeys) group.goalActual[key] += account[key];
      group.goalComplete = accounts.length > 0 && accounts.every(a => a.complete);
    }
  }
  return { kind: period.kind, weekKey: dates.weekKey, start: dates.reportStart.toISOString(), end: dates.reportEnd.toISOString(), generatedAt: now.toISOString(), groups: [...groups.values()], totals };
}

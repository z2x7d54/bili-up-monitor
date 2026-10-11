// Business dates use China time even when the portable folder runs on another timezone.
export const BUSINESS_TIME_ZONE = "Asia/Shanghai";
const DAY_MS = 86_400_000;
const CHINA_OFFSET_MS = 8 * 3_600_000;

export function businessDates(now = new Date()) {
  const local = new Date(now.getTime() + CHINA_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  return {
    monthKey: `${year}-${String(month + 1).padStart(2, "0")}`,
    monthLabel: `${year}年${month + 1}月`,
    monthStart: new Date(Date.UTC(year, month, 1) - CHINA_OFFSET_MS),
    monthEnd: new Date(Date.UTC(year, month + 1, 1) - CHINA_OFFSET_MS),
    todayStart: new Date(Date.UTC(year, month, day) - CHINA_OFFSET_MS),
  };
}

export function daysSincePublication(date: Date | null, now = new Date()) {
  if (!date) return null;
  return Math.max(0, Math.floor((businessDates(now).todayStart.getTime() - businessDates(date).todayStart.getTime()) / DAY_MS));
}

export type PublicationState = "PENDING" | "NO_VIDEOS" | "NO_MONTH_POSTS" | "OVERDUE" | "UPDATED";

export function publicationState(input: {
  complete: boolean; monthCount: number; lastPublishedAt: Date | null; overdueDays: number; now?: Date;
}): { state: PublicationState; days: number | null } {
  const days = daysSincePublication(input.lastPublishedAt, input.now);
  if (!input.complete) return { state: "PENDING", days };
  if (!input.lastPublishedAt) return { state: "NO_VIDEOS", days };
  if (days !== null && days >= input.overdueDays) return { state: "OVERDUE", days };
  if (input.monthCount === 0) return { state: "NO_MONTH_POSTS", days };
  return { state: "UPDATED", days };
}

export function overdueThreshold(value: string | number | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : 7;
}

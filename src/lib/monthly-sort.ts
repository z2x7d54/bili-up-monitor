import { compareNullableDate } from "@/lib/table-sort";

type MonthlyAccount = {
  name: string; followerCount: number; monthCount: number; monthViews: number;
  todayCount: number; lastPublishedAt: Date | null;
};
export function compareMonthlyAccounts(a: MonthlyAccount, b: MonthlyAccount, sort: string) {
  const diff = sort === "followers" ? b.followerCount - a.followerCount
    : sort === "month" ? b.monthCount - a.monthCount
    : sort === "views" ? b.monthViews - a.monthViews
    : sort === "updated_desc" ? compareNullableDate(a.lastPublishedAt, b.lastPublishedAt, "desc")
    : sort === "updated_asc" ? compareNullableDate(a.lastPublishedAt, b.lastPublishedAt, "asc")
    : sort === "oldest" ? (a.lastPublishedAt?.getTime() ?? 0) - (b.lastPublishedAt?.getTime() ?? 0)
    : b.todayCount - a.todayCount;
  return diff || b.monthCount - a.monthCount || a.name.localeCompare(b.name, "zh-CN");
}

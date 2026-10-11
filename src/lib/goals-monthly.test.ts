import { describe, expect, it } from "vitest";
import { buildMonthlyNotificationReport, buildWeeklyReport, monthlyNotificationDates } from "@/lib/weekly";
import { goalInputSchema, goalStatus } from "@/lib/goal-format";

const creator = { id: "a", mid: "1", name: "账号", groupName: "组", followerCount: 100, createdAt: new Date("2026-09-05"), lastVideoSyncAt: new Date("2026-10-01T02:00:00Z"), lastVideoSyncFromAt: new Date("2026-08-31T16:00:00Z"), lastError: null };
const video = { creatorId: "a", publishedAt: new Date("2026-08-31T16:00:00Z"), viewCount: 100, likeCount: 10, replyCount: 3, danmakuCount: 4, coinCount: 5, favoriteCount: 6, shareCount: 7 };
describe("monthly reports and recurring targets", () => {
  it("uses China first-day boundaries, prior full month, year rollover and leap days", () => {
    expect(monthlyNotificationDates(new Date("2026-09-30T15:59:59Z")).isFirst).toBe(false);
    const d = monthlyNotificationDates(new Date("2026-09-30T16:00:00Z"));
    expect(d.isFirst).toBe(true); expect(d.monthKey).toBe("2026-09");
    expect(d.reportStart.toISOString()).toBe("2026-08-31T16:00:00.000Z");
    expect(d.reportEnd.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(monthlyNotificationDates(new Date("2027-01-01T02:00:00Z")).monthKey).toBe("2026-12");
    const leap = monthlyNotificationDates(new Date("2028-03-01T02:00:00Z"));
    expect((leap.reportEnd.getTime() - leap.reportStart.getTime()) / 86400000).toBe(29);
    expect(monthlyNotificationDates(new Date("2026-10-01T16:00:00Z")).isFirst).toBe(false);
  });
  it("includes all groups and exact month range; a failed or partial account remains pending", () => {
    const report = buildMonthlyNotificationReport([creator, { ...creator, id: "b", lastError: "失败" }], [video, { ...video, publishedAt: new Date("2026-09-30T16:00:00Z") }, { ...video, publishedAt: new Date("2026-08-31T15:59:59Z") }], ["组", "空组"], new Date("2026-10-01T02:00:00Z"));
    expect(report).toMatchObject({ kind: "MONTH", weekKey: "2026-09" });
    expect(report.totals).toMatchObject({ posts: 1, views: 100, accounts: 2, groups: 2, pending: 1, noPosts: 0, added: 2 });
    expect(report.groups[1].accounts).toHaveLength(0);
  });
  it("keeps recurring weekly and monthly targets separate and snapshots only already configured goals", () => {
    const now = new Date("2026-10-05T02:00:00Z");
    const goals = [
      { creatorId: "a", groupName: null, period: "WEEK", targets: '{"posts":5}', createdAt: new Date("2026-09-01") },
      { creatorId: null, groupName: "组", period: "MONTH", targets: '{"views":1000}', createdAt: new Date("2026-09-01") },
      { creatorId: null, groupName: "组", period: "WEEK", targets: '{"posts":100}', createdAt: now },
    ];
    const week = buildWeeklyReport([creator], [], ["组"], now, goals);
    expect(week.groups[0].accounts[0].goal).toEqual({ posts: 5 });
    expect(week.groups[0].goal).toBeUndefined();
    const month = buildMonthlyNotificationReport([creator], [video], ["组"], now, goals);
    expect(month.groups[0].goal).toEqual({ views: 1000 });
    expect(month.groups[0].accounts[0].goal).toBeUndefined();
    goals[0].targets = '{"posts":9}';
    expect(week.groups[0].accounts[0].goal).toEqual({ posts: 5 });
  });
  it("requires every configured metric; incomplete data never declares success even if numbers reached", () => {
    const actual = { posts: 5, views: 100, likes: 10, comments: 3, coins: 2, favorites: 1, danmaku: 0, shares: 0 };
    expect(goalStatus({ posts: 5, views: 101 }, actual, true)).toMatchObject({ configured: 2, reached: 1, status: "未全部达标" });
    expect(goalStatus({ posts: 5, views: 100, shares: 0 }, actual, true).status).toBe("全部达标");
    expect(goalStatus({ posts: 5 }, actual, false).status).toBe("数据待补齐");
    expect(goalStatus({}, actual, true).status).toBe("未设置");
  });
  it("rejects negative, decimal, unsafe, unknown, ambiguous owners and weekly targets", () => {
    const value = { creatorId: "a", period: "MONTH", targets: { posts: 5 } };
    expect(goalInputSchema.safeParse(value).success).toBe(true);
    for (const targets of [{ posts: -1 }, { posts: 1.5 }, { views: Number.MAX_SAFE_INTEGER + 1 }, { other: 5 }]) expect(goalInputSchema.safeParse({ ...value, targets }).success).toBe(false);
    expect(goalInputSchema.safeParse({ ...value, groupName: "组" }).success).toBe(false);
    expect(goalInputSchema.safeParse({ ...value, period: "WEEK" }).success).toBe(false);
  });
});

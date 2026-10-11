import { describe, expect, it } from "vitest";
import { buildWeeklyReport, videoCollectionStart, weeklyDates } from "@/lib/weekly";

describe("weekly notifications", () => {
  it("switches only at Monday midnight in China, including across years", () => {
    expect(weeklyDates(new Date("2026-10-04T15:59:59Z")).isMonday).toBe(false);
    const monday = weeklyDates(new Date("2026-10-04T16:00:00Z"));
    expect(monday.isMonday).toBe(true);
    expect(monday.weekKey).toBe("2026-09-28");
    expect(monday.reportEnd.toISOString()).toBe("2026-10-04T16:00:00.000Z");
    expect(weeklyDates(new Date("2027-01-03T16:00:00Z")).weekKey).toBe("2026-12-28");
    expect(weeklyDates(new Date("2026-10-05T16:00:00Z")).isMonday).toBe(false);
  });
  it("collects six calendar months including the current month", () => {
    expect(videoCollectionStart(new Date("2026-10-05T02:00:00Z")).toISOString()).toBe("2026-04-30T16:00:00.000Z");
    expect(videoCollectionStart(new Date("2026-10-20T02:00:00Z")).toISOString()).toBe("2026-04-30T16:00:00.000Z");
  });
  it("includes every group, excludes boundary videos, and does not classify incomplete data as zero posts", () => {
    const now = new Date("2026-10-05T02:00:00Z");
    const creator = { id: "a", mid: "1", name: "账号A", groupName: "组A", followerCount: 100, createdAt: new Date("2026-09-30"), lastVideoSyncAt: now, lastVideoSyncFromAt: new Date("2026-09-27T16:00:00Z"), lastError: null };
    const video = { creatorId: "a", publishedAt: new Date("2026-09-27T16:00:00Z"), viewCount: 100, likeCount: 10, replyCount: 3, danmakuCount: 4, coinCount: 5, favoriteCount: 6, shareCount: 7 };
    const report = buildWeeklyReport([creator, { ...creator, id: "b", name: "账号B", groupName: "组B", lastVideoSyncFromAt: null }, { ...creator, id: "c", name: "账号C" }], [video, { ...video, publishedAt: new Date("2026-10-04T16:00:00Z") }, { ...video, publishedAt: new Date("2026-09-27T15:59:59Z") }], ["空分组", "组A", "组B"], now);
    expect(report.totals).toMatchObject({ posts: 1, views: 100, likes: 10, comments: 3, danmaku: 4, coins: 5, favorites: 6, shares: 7, groups: 3, accounts: 3, pending: 1, noPosts: 1, added: 3 });
    expect(report.groups[0].accounts).toHaveLength(0);
  });
});

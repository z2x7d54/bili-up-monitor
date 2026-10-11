import { z } from "zod";

export const GOAL_METRICS = ["posts", "views", "likes", "comments", "coins", "favorites", "danmaku", "shares"] as const;
export type GoalMetric = typeof GOAL_METRICS[number];
export type GoalTargets = Partial<Record<GoalMetric, number>>;
export const GOAL_LABELS: Record<GoalMetric, string> = { posts: "投稿数", views: "播放量", likes: "点赞", comments: "评论", coins: "投币", favorites: "收藏", danmaku: "弹幕", shares: "分享" };
const value = z.number().int().nonnegative().safe();
export const goalTargetsSchema = z.object({ posts: value.optional(), views: value.optional(), likes: value.optional(), comments: value.optional(), coins: value.optional(), favorites: value.optional(), danmaku: value.optional(), shares: value.optional() }).strict();
export const goalInputSchema = z.object({ creatorId: z.string().min(1).optional(), groupName: z.string().min(1).max(500).optional(), period: z.literal("MONTH"), targets: goalTargetsSchema }).strict().refine(v => !!v.creatorId !== !!v.groupName, "请选择账号月目标或分组月目标");
export function goalStatus(targets: GoalTargets, actual: Record<GoalMetric, number>, complete: boolean) {
  const configured = GOAL_METRICS.filter(key => targets[key] !== undefined);
  const reached = configured.filter(key => actual[key] >= targets[key]!);
  return { configured: configured.length, reached: reached.length, status: !configured.length ? "未设置" : !complete ? "数据待补齐" : reached.length === configured.length ? "全部达标" : "未全部达标" };
}

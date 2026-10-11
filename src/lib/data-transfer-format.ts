import { creatorAliasSchema, creatorNoteSchema } from "@/lib/creator-personal";
import { goalTargetsSchema } from "@/lib/goal-format";
import { z } from "zod";
import { groupHierarchy } from "@/lib/group-tree";

export const DATA_FILE_LIMIT = 100 * 1024 * 1024;
export const DATA_FILE_FORMAT = "YourBiliData";
const id = z.string().min(1).max(128);
const name = z.string().min(1).max(500);
const text = z.string().max(100_000).nullable();
const date = z.string().datetime({ offset: true });
const optionalDate = date.nullable();
const count = z.number().int().min(0).max(2_147_483_647);
const total = z.number().int().nonnegative().safe();
const timestamps = { createdAt: date, updatedAt: date };
const creator = z.object({ id, mid: z.string().regex(/^\d{1,20}$/), name, alias: creatorAliasSchema.optional(), note: creatorNoteSchema.optional(), avatarUrl: text, description: text, groupName: name,
  status: z.enum(["MONITORING", "PAUSED", "ERROR"]), followingCount: count, followerCount: count, likeCount: count, viewCount: count, videoCount: count,
  lastVideoSyncFromAt: optionalDate, lastVideoSyncAt: optionalDate, videoSyncMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  lastFetchedAt: optionalDate, lastFailedAt: optionalDate, lastError: text, ...timestamps }).strict();
const group = z.object({ name, parentName: name.nullable().default(null), description: text, sortOrder: z.number().int().min(-2_147_483_648).max(2_147_483_647), ...timestamps }).strict();
const content = z.object({ id, bvid: id, aid: text, creatorId: id, title: name, coverUrl: text, publishedAt: optionalDate,
  durationText: text, durationSeconds: count, category: text, viewCount: count, danmakuCount: count, replyCount: count, favoriteCount: count,
  coinCount: count, shareCount: count, likeCount: count, lastFetchedAt: optionalDate, ...timestamps }).strict();
const task = z.object({ id, name, targetMode: z.enum(["ALL_ACTIVE", "GROUP", "SELECTED"]), groupName: name.nullable(),
  intervalMinutes: z.number().int().min(1).max(1440), status: z.enum(["ACTIVE", "PAUSED", "ERROR"]), nextRunAt: optionalDate,
  lastRunAt: optionalDate, lastSuccessAt: optionalDate, lastFailedAt: optionalDate, lastResult: text, lastError: text, isRunning: z.boolean(), ...timestamps }).strict();
const target = z.object({ id, taskId: id, creatorId: id, createdAt: date }).strict();
const snapshot = z.object({ id, creatorId: id.nullable(), contentId: id.nullable(), followerCount: count.nullable(), followingCount: count.nullable(),
  likeCount: count.nullable(), viewCount: count.nullable(), videoCount: count.nullable(), danmakuCount: count.nullable(), replyCount: count.nullable(),
  favoriteCount: count.nullable(), coinCount: count.nullable(), shareCount: count.nullable(), capturedAt: date }).strict();
const run = z.object({ id, taskId: id.nullable(), status: z.enum(["RUNNING", "SUCCESS", "PARTIAL", "FAILED"]), startedAt: date, finishedAt: optionalDate,
  successCount: count, failureCount: count, itemCount: count, errorCode: text, errorMessage: text, details: text }).strict();
// Read old WEEK rows for validation, then discard retired features before import.
const goal = z.object({ id, creatorId: id.nullable(), groupName: name.nullable(), period: z.enum(["WEEK", "MONTH"]), targets: z.string().max(10000), ...timestamps }).strict().refine(g => !!g.creatorId !== !!g.groupName);
const metrics = { posts: total, views: total, likes: total, comments: total, danmaku: total, coins: total, favorites: total, shares: total };
const weeklyAccount = z.object({ ...metrics, id, mid: z.string().regex(/^\d{1,20}$/), name, followers: total, complete: z.boolean(), addedThisWeek: z.boolean(), collectedAt: optionalDate, goal: goalTargetsSchema.optional() }).strict();
const report = z.object({ kind: z.enum(["WEEK", "MONTH"]).optional(), weekKey: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/), start: date, end: date, generatedAt: date,
  groups: z.array(z.object({ ...metrics, name, accounts: z.array(weeklyAccount), pending: total, noPosts: total, path: name.optional(), goalActual: z.object(metrics).strict().optional(), goalComplete: z.boolean().optional(), goal: goalTargetsSchema.optional() }).strict()),
  totals: z.object({ ...metrics, accounts: total, groups: total, pending: total, noPosts: total, added: total }).strict() }).strict();
const notification = z.object({ id, kind: z.enum(["WEEK", "MONTH"]).default("WEEK"), weekKey: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/), periodStart: date, periodEnd: date,
  payload: z.string().max(DATA_FILE_LIMIT), readAt: optionalDate, popupSeenAt: optionalDate, createdAt: date }).strict();
export const dataFileSchema = z.object({ format: z.literal(DATA_FILE_FORMAT), version: z.literal(1), exportedAt: date,
  data: z.object({ creators: z.array(creator), groups: z.array(group), contents: z.array(content), tasks: z.array(task),
    targets: z.array(target), snapshots: z.array(snapshot), runs: z.array(run), notifications: z.array(notification), goals: z.array(goal).default([]) }).strict() }).strict();
export type DataFile = z.infer<typeof dataFileSchema>;
export type DataSummary = { accounts: number; groups: number; videos: number; notifications: number; snapshots: number; tasks: number; goals: number; exportedAt: string };
export function summarizeData(file: DataFile): DataSummary {
  return { accounts: file.data.creators.length, groups: file.data.groups.length, videos: file.data.contents.length,
    notifications: file.data.notifications.length, snapshots: file.data.snapshots.length, tasks: file.data.tasks.length, goals: file.data.goals.length, exportedAt: file.exportedAt };
}

export function parseDataFile(input: unknown): DataFile {
  const parsed = dataFileSchema.safeParse(input);
  if (!parsed.success) throw new Error("文件格式或版本不正确，请上传由 YourBili「下载数据」生成的 JSON 文件。");
  const file = parsed.data;
  const unique = <T>(rows: T[], key: (row: T) => string, label: string) => {
    const values = rows.map(key); const set = new Set(values);
    if (set.size !== values.length) throw new Error(`文件包含重复的${label}，未导入任何数据。`);
    return set;
  };
  const creators = unique(file.data.creators, row => row.id, "账号 ID");
  unique(file.data.creators, row => row.mid, "账号 UID");
  const groups = unique(file.data.groups, row => row.name, "分组");
  groupHierarchy(file.data.groups);
  const contents = unique(file.data.contents, row => row.id, "视频 ID");
  unique(file.data.contents, row => row.bvid, "视频 BV 号");
  const tasks = unique(file.data.tasks, row => row.id, "任务");
  unique(file.data.targets, row => row.id, "任务成员 ID");
  unique(file.data.targets, row => JSON.stringify([row.taskId, row.creatorId]), "任务成员");
  unique(file.data.snapshots, row => row.id, "快照"); unique(file.data.runs, row => row.id, "采集记录");
  unique(file.data.notifications, row => row.id, "通知 ID"); unique(file.data.notifications, row => row.weekKey, "报告日期");
  unique(file.data.goals, row => row.id, "目标 ID"); unique(file.data.goals, row => JSON.stringify([row.creatorId, row.groupName, row.period]), "目标配置");
  for (const row of file.data.goals) {
    if ((row.creatorId && !creators.has(row.creatorId)) || (row.groupName && !groups.has(row.groupName))) throw new Error("目标的账号或分组缺失，未导入任何数据。");
    try { goalTargetsSchema.parse(JSON.parse(row.targets)); } catch { throw new Error("目标格式不正确，未导入任何数据。"); }
  }
  if (file.data.creators.some(row => !groups.has(row.groupName)) || file.data.contents.some(row => !creators.has(row.creatorId)) ||
    file.data.targets.some(row => !creators.has(row.creatorId) || !tasks.has(row.taskId)) ||
    file.data.snapshots.some(row => (row.creatorId && !creators.has(row.creatorId)) || (row.contentId && !contents.has(row.contentId))) ||
    file.data.runs.some(row => row.taskId && !tasks.has(row.taskId)) || file.data.tasks.some(row => row.targetMode === "GROUP" && (!row.groupName || !groups.has(row.groupName)))) {
    throw new Error("文件中的账号、分组或关联数据缺失，未导入任何数据。");
  }
  for (const item of file.data.notifications) {
    let value: unknown;
    try { value = JSON.parse(item.payload); } catch { throw new Error("通知内容损坏，未导入任何数据。"); }
    const checked = report.safeParse(value);
    if (!checked.success || (checked.data.kind ?? "WEEK") !== item.kind || !(item.kind === "MONTH" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(item.weekKey) || checked.data.weekKey !== item.weekKey || checked.data.start !== item.periodStart || checked.data.end !== item.periodEnd || new Date(item.periodStart) >= new Date(item.periodEnd)) {
      throw new Error("通知格式或统计日期不正确，未导入任何数据。");
    }
  }
  file.data.goals = file.data.goals.filter(row => row.period === "MONTH");
  file.data.notifications = file.data.notifications.filter(row => row.kind === "MONTH");
  return file;
}

export async function readDataRequest(request: Request, limit = DATA_FILE_LIMIT) {
  const header = request.headers.get("content-length");
  const length = header === null ? null : Number(header);
  if (length !== null && (!Number.isSafeInteger(length) || length < 0)) throw new Error("上传请求长度不正确，未导入任何数据。");
  if (length !== null && length > limit) throw new Error("文件超过 100 MB，当前版本支持 100 MB 以内的数据文件。");
  if (!request.body) throw new Error("请选择数据文件。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("文件超过 100 MB，未导入任何数据。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  // A proxy may silently buffer only a prefix; do not call that a corrupt JSON file.
  if (length !== null && size !== length) throw new Error("上传数据未接收完整，请重试；如重复出现，请更新并重启服务后再上传。未导入任何数据。");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error("文件不是有效的 JSON 数据，未导入任何数据。"); }
}

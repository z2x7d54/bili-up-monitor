import { mergeCreatorPersonalFields } from "@/lib/creator-personal";
import type { Prisma } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { DATA_FILE_FORMAT, DATA_FILE_LIMIT, parseDataFile, summarizeData, type DataFile } from "@/lib/data-transfer-format";
import { withDataImport } from "@/lib/data-transfer-lock";
import type { WeeklyReport } from "@/lib/weekly";
import { groupHierarchy } from "@/lib/group-tree";

async function collectData(tx: Prisma.TransactionClient, now = new Date()): Promise<DataFile> {
  const [creators, groups, contents, tasks, targets, snapshots, runs, notifications, goals] = await Promise.all([
    tx.upCreator.findMany({ orderBy: { mid: "asc" } }), tx.creatorGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    tx.contentItem.findMany({ orderBy: { bvid: "asc" } }), tx.monitorTask.findMany({ orderBy: { id: "asc" } }),
    tx.taskTarget.findMany({ orderBy: { id: "asc" } }), tx.metricSnapshot.findMany({ orderBy: { id: "asc" } }),
    tx.taskRunLog.findMany({ orderBy: { id: "asc" } }), tx.weeklyNotification.findMany({ where: { kind: "MONTH" }, orderBy: { weekKey: "desc" } }), tx.goalConfig.findMany({ where: { period: "MONTH" }, orderBy: { id: "asc" } }),
  ]);
  // Explicit tables exclude local credentials and machine-specific settings.
  return JSON.parse(JSON.stringify({ format: DATA_FILE_FORMAT, version: 1, exportedAt: now.toISOString(), data: { creators, groups, contents, tasks, targets, snapshots, runs, notifications, goals } })) as DataFile;
}

export async function exportDataFile(now = new Date()) {
  const file = await prisma.$transaction(tx => collectData(tx, now), { timeout: 120_000 });
  const json = JSON.stringify(file);
  if (Buffer.byteLength(json) > DATA_FILE_LIMIT) throw new Error("数据超过当前 100 MB 文件上限，请联系维护人员扩展迁移容量。");
  return { file, json, summary: summarizeData(file) };
}

type Dates<T> = { [K in keyof T]: K extends `${string}At` | "periodStart" | "periodEnd" ? (T[K] extends string ? Date : Date | null) : T[K] };
function dates<T extends object>(row: T): Dates<T> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, (key.endsWith("At") || key === "periodStart" || key === "periodEnd") && typeof value === "string" ? new Date(value) : value])) as Dates<T>;
}
function chunks<T>(rows: T[], size = 400) { return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size)); }

export async function importDataFile(input: unknown, options: { now?: Date; backupDirectory?: string; personalDataMode?: "local" | "file" } = {}) {
  // Validate format and references before obtaining a lock or writing any row.
  const file = parseDataFile(input);
  const hasGoals = !!input && typeof input === "object" && "data" in input && !!input.data && typeof input.data === "object" && "goals" in input.data;
  const now = options.now ?? new Date();
  const backupDirectory = options.backupDirectory ?? resolve(process.cwd(), ".local-backups/data-transfer");
  return withDataImport(async () => prisma.$transaction(async tx => {
    if (await tx.monitorTask.count({ where: { isRunning: true } })) throw new Error("当前有监控任务正在运行，请执行完成后再上传数据。");
    const mergedGroups = new Map((await tx.creatorGroup.findMany()).map(g => [g.name,g]));
    for (const g of file.data.groups) mergedGroups.set(g.name,{ ...g, createdAt:new Date(g.createdAt),updatedAt:new Date(g.updatedAt) });
    groupHierarchy([...mergedGroups.values()]);
    const previous = await collectData(tx, now);
    await mkdir(backupDirectory, { recursive: true });
    const backupName = `before-import-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
    await writeFile(resolve(backupDirectory, backupName), JSON.stringify(previous), { flag: "wx" });
    const creatorIds = new Map<string, string>();
    const contentIds = new Map<string, string>();
    let addedAccounts = 0; let updatedAccounts = 0; let preservedPersonalAccounts = 0;
    for (const row of file.data.groups) {
      const data = dates(row);
      await tx.creatorGroup.upsert({ where: { name: row.name }, create: data, update: data });
    }
    for (const row of file.data.creators) {
      const { id: oldId, ...data } = dates(row);
      const previousAccount = await tx.upCreator.findUnique({ where: { mid: row.mid }, select: { id: true, alias: true, note: true } });
      const personal = mergeCreatorPersonalFields(previousAccount, row, options.personalDataMode === "file");
      if (previousAccount && ((previousAccount.alias?.trim() && personal.alias === previousAccount.alias && previousAccount.alias !== row.alias) || (previousAccount.note?.trim() && personal.note === previousAccount.note && previousAccount.note !== row.note))) preservedPersonalAccounts++;
      const imported = await tx.upCreator.upsert({ where: { mid: row.mid }, create: { ...data, ...personal }, update: { ...data, ...personal } });
      creatorIds.set(oldId, imported.id);
      if (previousAccount) updatedAccounts++; else addedAccounts++;
    }
    for (const row of file.data.contents) {
      const { id: oldId, ...values } = dates(row);
      const data = { ...values, creatorId: creatorIds.get(row.creatorId)! };
      const imported = await tx.contentItem.upsert({ where: { bvid: row.bvid }, create: data, update: data });
      contentIds.set(oldId, imported.id);
    }
    for (const row of file.data.tasks) {
      const values = dates(row);
      const data = { ...values, isRunning: false, nextRunAt: values.nextRunAt && values.nextRunAt > now ? values.nextRunAt : new Date(now.getTime() + row.intervalMinutes * 60_000) };
      await tx.monitorTask.upsert({ where: { id: row.id }, create: data, update: data });
      await tx.taskTarget.deleteMany({ where: { taskId: row.id } });
    }
    for (const batch of chunks(file.data.targets)) await tx.taskTarget.createMany({ data: batch.map(row => ({ taskId: row.taskId, creatorId: creatorIds.get(row.creatorId)!, createdAt: new Date(row.createdAt) })) });
    for (const batch of chunks(file.data.snapshots)) {
      const existing = new Set((await tx.metricSnapshot.findMany({ where: { id: { in: batch.map(row => row.id) } }, select: { id: true } })).map(row => row.id));
      const fresh = batch.filter(row => !existing.has(row.id)).map(row => ({ ...dates(row), creatorId: row.creatorId ? creatorIds.get(row.creatorId)! : null, contentId: row.contentId ? contentIds.get(row.contentId)! : null }));
      if (fresh.length) await tx.metricSnapshot.createMany({ data: fresh });
    }
    for (const batch of chunks(file.data.runs)) {
      const existing = new Set((await tx.taskRunLog.findMany({ where: { id: { in: batch.map(row => row.id) } }, select: { id: true } })).map(row => row.id));
      const fresh = batch.filter(row => !existing.has(row.id)).map(row => ({ ...dates(row), ...(row.status === "RUNNING" ? { status: "FAILED", finishedAt: now, errorCode: "MIGRATED_RUNNING_TASK", errorMessage: "迁移时中断的采集记录，任务将在新电脑按周期重新运行。" } : {}) }));
      if (fresh.length) await tx.taskRunLog.createMany({ data: fresh });
    }
    if (hasGoals) await tx.goalConfig.deleteMany({ where: { OR: [{ creatorId: { in: [...creatorIds.values()] } }, { groupName: { in: file.data.groups.map(g => g.name) } }] } });
    for (const row of file.data.goals) {
      const { id: sourceId, ...values } = dates(row); void sourceId;
      const data = { ...values, creatorId: row.creatorId ? creatorIds.get(row.creatorId)! : null };
      if (data.creatorId) await tx.goalConfig.upsert({ where: { creatorId_period: { creatorId: data.creatorId, period: row.period } }, create: data, update: data });
      else await tx.goalConfig.upsert({ where: { groupName_period: { groupName: row.groupName!, period: row.period } }, create: data, update: data });
    }
    for (const row of file.data.notifications) {
      const prior = await tx.weeklyNotification.findUnique({ where: { weekKey: row.weekKey }, select: { readAt: true, popupSeenAt: true } });
      const payload = JSON.parse(row.payload) as WeeklyReport;
      for (const group of payload.groups) for (const account of group.accounts) account.id = creatorIds.get(account.id) ?? account.id;
      const { id: sourceId, ...values } = dates(row);
      void sourceId;
      const data = { ...values, payload: JSON.stringify(payload), readAt: prior?.readAt ?? values.readAt, popupSeenAt: prior?.popupSeenAt ?? values.popupSeenAt };
      await tx.weeklyNotification.upsert({ where: { weekKey: row.weekKey }, create: data, update: data });
    }
    return { ...summarizeData(file), addedAccounts, updatedAccounts, preservedPersonalAccounts, backupName };
  }, { timeout: 180_000, maxWait: 10_000 }));
}

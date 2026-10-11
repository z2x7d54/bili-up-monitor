import { prisma } from "@/lib/db";
import { withDataWrite } from "@/lib/data-transfer-lock";
import { goalInputSchema, goalTargetsSchema } from "@/lib/goal-format";
import { businessDates } from "@/lib/monthly";
import { descendantGroupNames } from "@/lib/group-tree";
import { buildPeriodReport } from "@/lib/weekly";

export async function getGoal(input: { creatorId?: string; groupName?: string; period: "MONTH" }, now = new Date()) {
  const scope = goalInputSchema.parse({ ...input, targets: {} });
  const monthly = businessDates(now);
  const start = monthly.monthStart;
  const end = monthly.monthEnd;
  const result = await prisma.$transaction(async tx => {
    if (scope.creatorId) await tx.upCreator.findUniqueOrThrow({ where: { id: scope.creatorId } });
    else await tx.creatorGroup.findUniqueOrThrow({ where: { name: scope.groupName! } });
    const groups = await tx.creatorGroup.findMany({ select:{ name:true,parentName:true } });
    const creators = await tx.upCreator.findMany({ where: scope.creatorId ? { id: scope.creatorId } : { groupName:{ in:descendantGroupNames(groups,scope.groupName!) } } });
    const videos = await tx.contentItem.findMany({ where: { creatorId: { in: creators.map(c => c.id) }, publishedAt: { gte: start, lt: new Date(Math.min(end.getTime(), now.getTime() + 1)) } } });
    const row = await tx.goalConfig.findFirst({ where: scope.creatorId ? { creatorId: scope.creatorId, period: scope.period } : { groupName: scope.groupName, period: scope.period } });
    const report = buildPeriodReport(creators, videos, scope.groupName ? [scope.groupName] : [], { start, end, key: monthly.monthKey, kind: scope.period }, now, [], false);
    return { targets: row ? goalTargetsSchema.parse(JSON.parse(row.targets)) : {}, actual: report.totals, complete: report.totals.pending === 0 && creators.length > 0, collectedAt: creators.reduce<string | null>((old, c) => !c.lastVideoSyncAt ? old : !old || c.lastVideoSyncAt.toISOString() < old ? c.lastVideoSyncAt.toISOString() : old, null) };
  });
  return { ...result, period: scope.period, start: start.toISOString(), end: end.toISOString() };
}

export async function saveGoal(input: unknown) {
  const scope = goalInputSchema.parse(input);
  return withDataWrite(() => prisma.$transaction(async tx => {
    if (scope.creatorId) await tx.upCreator.findUniqueOrThrow({ where: { id: scope.creatorId } });
    else await tx.creatorGroup.findUniqueOrThrow({ where: { name: scope.groupName! } });
    const where = scope.creatorId ? { creatorId: scope.creatorId, period: scope.period } : { groupName: scope.groupName!, period: scope.period };
    if (!Object.keys(scope.targets).length) return tx.goalConfig.deleteMany({ where });
    const data = { creatorId: scope.creatorId ?? null, groupName: scope.groupName ?? null, period: scope.period, targets: JSON.stringify(scope.targets) };
    return scope.creatorId ? tx.goalConfig.upsert({ where: { creatorId_period: { creatorId: scope.creatorId, period: scope.period } }, create: data, update: data }) : tx.goalConfig.upsert({ where: { groupName_period: { groupName: scope.groupName!, period: scope.period } }, create: data, update: data });
  }));
}

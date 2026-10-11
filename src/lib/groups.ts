import { withDataWrite } from "@/lib/data-transfer-lock";
import { DEFAULT_GROUP_NAME, TASK_TARGET_MODE } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { descendantGroupNames, groupHierarchy } from "@/lib/group-tree";
export type CreatorGroupSummary = {
  name: string; parentName: string | null; depth: number; path: string;
  description: string | null; sortOrder: number; count: number; totalCount: number;
  createdAt: Date | null; updatedAt: Date | null;
};
export function normalizeGroupName(value: unknown) {
  return (typeof value === "string" ? value.trim() : "") || DEFAULT_GROUP_NAME;
}
function assertName(value: unknown) {
  const name = normalizeGroupName(value);
  if (name === "ALL" || name.length > 32) throw new Error("分组名称不能为 ALL 或超过 32 个字符");
  return name;
}
function parentValue(value: unknown) { return typeof value === "string" ? value.trim() || null : null; }
export async function listCreatorGroups(): Promise<CreatorGroupSummary[]> {
  return withDataWrite(() => prisma.$transaction(async tx => {
    const used = await tx.upCreator.findMany({ distinct: ["groupName"], select: { groupName: true } });
    let groups = await tx.creatorGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    let order = Math.max(0,...groups.map(g => g.sortOrder));
    for (const name of new Set([DEFAULT_GROUP_NAME,...used.map(c => normalizeGroupName(c.groupName))])) {
      if (!groups.some(g => g.name === name)) { order += 1024; groups.push(await tx.creatorGroup.create({ data: { name, sortOrder: order } })); }
    }
    const counts = await tx.upCreator.groupBy({ by: ["groupName"], _count: { _all: true } });
    const countMap = new Map(counts.map(c => [c.groupName,c._count._all]));
    groups = groups.sort((a,b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name,"zh-CN"));
    return groupHierarchy(groups).map(g => ({ ...g, count: countMap.get(g.name) ?? 0,
      totalCount: descendantGroupNames(groups,g.name).reduce((n,name) => n + (countMap.get(name) ?? 0),0) }));
  }));
}
export async function getGroupScope(name: string) {
  return descendantGroupNames(await prisma.creatorGroup.findMany({ select: { name: true, parentName: true } }),name);
}
export async function createCreatorGroup(input: { name: unknown; description?: unknown; parentName?: unknown }) {
  return withDataWrite(() => prisma.$transaction(async tx => {
    const name = assertName(input.name), parentName = parentValue(input.parentName);
    const groups = await tx.creatorGroup.findMany();
    if (groups.some(g => g.name === name)) throw new Error("分组名称已存在，请使用不同名称");
    const sortOrder = Math.max(0,...groups.map(g => g.sortOrder)) + 1024;
    groupHierarchy([...groups,{ name,parentName,sortOrder }]);
    return tx.creatorGroup.create({ data: { name,parentName,sortOrder, description: typeof input.description === "string" ? input.description.trim() || null : null } });
  }));
}
export async function ensureCreatorGroup(input: unknown) {
  const name = assertName(input);
  const existing = await prisma.creatorGroup.findUnique({ where: { name } });
  if (existing) return existing;
  return withDataWrite(() => prisma.$transaction(async tx => {
    const latest = await tx.creatorGroup.findUnique({ where: { name } }); if (latest) return latest;
    const max = await tx.creatorGroup.aggregate({ _max: { sortOrder: true } });
    return tx.creatorGroup.create({ data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1024 } });
  }));
}
export async function renameCreatorGroup(input: { name: unknown; nextName: unknown }) {
  const name = assertName(input.name), nextName = assertName(input.nextName);
  if (name === DEFAULT_GROUP_NAME) throw new Error("默认分组不能重命名");
  return withDataWrite(() => prisma.$transaction(async tx => {
    await tx.creatorGroup.findUniqueOrThrow({ where: { name } });
    if (name === nextName) return tx.creatorGroup.findUniqueOrThrow({ where: { name } });
    if (await tx.creatorGroup.findUnique({ where: { name: nextName } })) throw new Error("分组名称已存在");
    const group = await tx.creatorGroup.update({ where: { name }, data: { name: nextName } });
    await tx.creatorGroup.updateMany({ where: { parentName: name }, data: { parentName: nextName } });
    await tx.upCreator.updateMany({ where: { groupName: name }, data: { groupName: nextName } });
    await tx.monitorTask.updateMany({ where: { targetMode: TASK_TARGET_MODE.GROUP, groupName: name }, data: { groupName: nextName } });
    return group;
  }));
}
export async function moveCreatorGroup(input: { name: unknown; parentName?: unknown }) {
  const name = assertName(input.name), parentName = parentValue(input.parentName);
  if (name === DEFAULT_GROUP_NAME) throw new Error("默认分组不能移动");
  return withDataWrite(() => prisma.$transaction(async tx => {
    await tx.creatorGroup.findUniqueOrThrow({ where: { name } });
    const groups = await tx.creatorGroup.findMany();
    groupHierarchy(groups.map(g => g.name === name ? { ...g,parentName } : g));
    return tx.creatorGroup.update({ where: { name }, data: { parentName } });
  }));
}
export async function deleteCreatorGroup(input: { name: unknown; moveTo?: unknown }) {
  const name = assertName(input.name), moveTo = assertName(input.moveTo);
  if (name === DEFAULT_GROUP_NAME) throw new Error("默认分组不能删除");
  if (name === moveTo) throw new Error("迁移目标不能是当前分组");
  return withDataWrite(() => prisma.$transaction(async tx => {
    if (await tx.creatorGroup.count({ where: { parentName: name } })) throw new Error("请先移动或删除下级分组，再删除当前分组");
    await tx.creatorGroup.findUniqueOrThrow({ where: { name } });
    await tx.creatorGroup.findUniqueOrThrow({ where: { name: moveTo } });
    await tx.upCreator.updateMany({ where: { groupName: name }, data: { groupName: moveTo } });
    await tx.monitorTask.updateMany({ where: { targetMode: TASK_TARGET_MODE.GROUP, groupName: name }, data: { groupName: moveTo } });
    await tx.creatorGroup.delete({ where: { name } });
    return { deleted: true, movedTo: moveTo };
  }));
}
export async function reorderCreatorGroups(input: { names: unknown[] }) {
  const names = input.names.map(assertName);
  return withDataWrite(() => prisma.$transaction(async tx => {
    const groups = await tx.creatorGroup.findMany();
    if (names[0] !== DEFAULT_GROUP_NAME || names.length !== groups.length || new Set(names).size !== names.length || names.some(n => !groups.some(g => g.name === n))) throw new Error("排序数据已变化，请刷新重试");
    for (const [index,name] of names.entries()) await tx.creatorGroup.update({ where: { name }, data: { sortOrder: (index + 1) * 1024 } });
    return { reordered: true };
  }));
}

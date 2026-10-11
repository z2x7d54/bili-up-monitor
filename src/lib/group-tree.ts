import { DEFAULT_GROUP_NAME } from "@/lib/constants";
export const MAX_GROUP_DEPTH = 4;
export type GroupNode = { name: string; parentName?: string | null; sortOrder?: number };
export function groupHierarchy<T extends GroupNode>(groups: T[]) {
  const byName = new Map(groups.map(g => [g.name, g]));
  const cache = new Map<string, string[]>();
  function path(name: string, visiting = new Set<string>()): string[] {
    if (cache.has(name)) return cache.get(name)!;
    if (visiting.has(name)) throw new Error("分组不能循环嵌套");
    const node = byName.get(name);
    if (!node) throw new Error("上级分组不存在");
    visiting.add(name);
    const result = node.parentName ? [...path(node.parentName, visiting), name] : [name];
    visiting.delete(name);
    if (result.length > MAX_GROUP_DEPTH) throw new Error("分组最多支持四级");
    if (node.parentName && (name === DEFAULT_GROUP_NAME || node.parentName === DEFAULT_GROUP_NAME)) throw new Error("未分组必须独立保留，不能作为上级或子级");
    cache.set(name, result);
    return result;
  }
  const nodes = groups.map(g => ({ ...g, parentName: g.parentName ?? null, depth: path(g.name).length, path: path(g.name).join(" / ") }));
  const result: typeof nodes = [];
  function visit(parent: string | null) {
    for (const node of nodes.filter(g => g.parentName === parent).sort((a,b) => a.name === DEFAULT_GROUP_NAME ? -1 : b.name === DEFAULT_GROUP_NAME ? 1 : (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name,"zh-CN"))) {
      result.push(node); visit(node.name);
    }
  }
  visit(null);
  return result;
}
export function descendantGroupNames(groups: GroupNode[], name: string) {
  const found = new Set([name]);
  for (let changed = true; changed;) {
    changed = false;
    for (const g of groups) if (g.parentName && found.has(g.parentName) && !found.has(g.name)) { found.add(g.name); changed = true; }
  }
  return [...found];
}

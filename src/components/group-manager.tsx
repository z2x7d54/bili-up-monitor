"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderPlus, Pencil, Trash2, FolderTree, ArrowUp, ArrowDown } from "lucide-react";
import { GoalButton } from "@/components/goal-button";
import { DEFAULT_GROUP_NAME } from "@/lib/constants";
import { descendantGroupNames } from "@/lib/group-tree";
import type { CreatorGroupSummary } from "@/lib/groups";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
export function GroupManager({ groups }: { groups: CreatorGroupSummary[] }) {
  const router = useRouter();
  const [open,setOpen] = useState(false);
  const [action,setAction] = useState<{ type: "rename" | "move" | "delete"; name: string } | null>(null);
  const [error,setError] = useState("");
  const [pending,startTransition] = useTransition();
  async function request(method: string, body: unknown) {
    setError("");
    try {
      const response = await fetch("/api/groups",{ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "操作失败");
      router.refresh(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); return false; }
  }
  const descendants = action ? descendantGroupNames(groups,action.name) : [];
  const parentOptions = groups.filter(g => g.name !== DEFAULT_GROUP_NAME && g.depth < 4 && !descendants.includes(g.name));
  function submit(event: React.FormEvent<HTMLFormElement>, type: "create" | "rename" | "move" | "delete") {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    const body = type === "create" ? { name: fields.get("name"), parentName: fields.get("parentName") || null }
      : type === "rename" ? { name: action!.name, nextName: fields.get("nextName") }
      : type === "move" ? { name: action!.name, parentName: fields.get("parentName") || null }
      : { name: action!.name, moveTo: fields.get("moveTo") };
    startTransition(async () => { if (await request(type === "create" ? "POST" : type === "delete" ? "DELETE" : "PATCH",body)) { if (type === "create") form.reset(); else setAction(null); } });
  }
  function order(group: CreatorGroupSummary, direction: number) {
    const siblings = groups.filter(g => g.parentName === group.parentName && g.name !== DEFAULT_GROUP_NAME);
    const next = siblings[siblings.findIndex(g => g.name === group.name) + direction];
    if (!next) return;
    const names = groups.map(g => g.name), a = names.indexOf(group.name), b = names.indexOf(next.name);
    [names[a],names[b]] = [names[b],names[a]];
    startTransition(async () => { await request("PATCH",{ names }); });
  }
  const selectClass = "h-9 w-full rounded-md border bg-white px-2 text-sm";
  return <>
    <Button variant="outline" onClick={() => { setError(""); setOpen(true); }}><FolderTree className="size-4" />分组管理</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>四级分组管理</DialogTitle><DialogDescription>账号可归属任一级。选择上级分组创建子级；父级筛选、月目标包含全部下级账号。名称不可重复，未分组独立保留。</DialogDescription></DialogHeader>
      <form onSubmit={e => submit(e,"create")} className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1 text-sm">分组名称<Input name="name" maxLength={32} required placeholder="输入名称" /></label>
        <label className="space-y-1 text-sm">上级分组<select name="parentName" className={selectClass}><option value="">无上级（一级分组）</option>{groups.filter(g => g.name !== DEFAULT_GROUP_NAME && g.depth < 4).map(g => <option key={g.name} value={g.name}>{g.path}（{g.depth}级）</option>)}</select></label>
        <Button disabled={pending}><FolderPlus className="size-4" />创建</Button>
      </form>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="space-y-2">{groups.map(g => <div key={g.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" style={{ marginLeft: (g.depth - 1) * 20 }}>
        <div className="min-w-0"><b>{g.name}</b><span className="ml-2 text-xs text-slate-400">{g.depth}级</span><p className="mt-1 text-xs text-slate-500">{g.path} · 直属 {g.count} 个账号 · 含下级 {g.totalCount} 个</p></div>
        <div className="flex flex-wrap gap-1"><GoalButton groupName={g.name} name={g.path} />{g.name !== DEFAULT_GROUP_NAME && <>
          <Button variant="ghost" size="icon" title="同级上移" disabled={pending} onClick={() => order(g,-1)}><ArrowUp className="size-4" /></Button>
          <Button variant="ghost" size="icon" title="同级下移" disabled={pending} onClick={() => order(g,1)}><ArrowDown className="size-4" /></Button>
          <Button variant="ghost" size="icon" title="重命名" disabled={pending} onClick={() => { setError(""); setAction({ type: "rename",name:g.name }); }}><Pencil className="size-4" /></Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setError(""); setAction({ type: "move",name:g.name }); }}>移动</Button>
          <Button variant="ghost" size="icon" title="删除并迁移直属账号" disabled={pending} onClick={() => { setError(""); setAction({ type: "delete",name:g.name }); }}><Trash2 className="size-4 text-rose-600" /></Button>
        </>}</div>
      </div>)}</div>
    </DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={v => { if (!v && !pending) setAction(null); }}><DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{action?.type === "rename" ? "重命名" : action?.type === "move" ? "移动" : "删除"}分组：{action?.name}</DialogTitle><DialogDescription>{action?.type === "delete" ? "有下级分组时请先移动下级。删除后直属账号及监控任务迁移到所选分组。" : "调整会保留账号和月目标；移动后整个下级目录一起迁移，最多四级。"}</DialogDescription></DialogHeader>
      {action && <form onSubmit={e => submit(e,action.type)} className="space-y-4">
        {action.type === "rename" ? <Input name="nextName" defaultValue={action.name} maxLength={32} required /> : <select name={action.type === "move" ? "parentName" : "moveTo"} defaultValue={action.type === "move" ? groups.find(g => g.name === action.name)?.parentName ?? "" : DEFAULT_GROUP_NAME} className={selectClass}>
          {action.type === "move" && <option value="">无上级（一级分组）</option>}
          {(action.type === "move" ? parentOptions : groups.filter(g => !descendants.includes(g.name))).map(g => <option key={g.name} value={g.name}>{g.path}</option>)}
        </select>}
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<Button disabled={pending} type="submit">{pending ? "保存中…" : "确认"}</Button>
      </form>}
    </DialogContent></Dialog>
  </>;
}

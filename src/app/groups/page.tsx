import { creatorDisplayName } from "@/lib/creator-personal";
import Link from "next/link";
import { listCreatorGroups, type CreatorGroupSummary } from "@/lib/groups";
import { prisma } from "@/lib/db";
import { GroupManager } from "@/components/group-manager";
import { GoalButton } from "@/components/goal-button";
export const dynamic="force-dynamic";
export default async function GroupsPage() {
  const groups=await listCreatorGroups();
  const accounts=await prisma.upCreator.findMany({ select:{id:true,name:true,alias:true,note:true,mid:true,groupName:true},orderBy:{name:"asc"} });
  function render(group: CreatorGroupSummary): React.ReactNode {
    const children=groups.filter(g=>g.parentName===group.name),direct=accounts.filter(a=>a.groupName===group.name);
    return <details key={group.name} open className="rounded-xl border bg-white">
      <summary className="cursor-pointer p-4"><b>{group.name}</b><span className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{group.depth}级</span><span className="ml-3 text-xs text-slate-500">直属 {group.count} 个 · 含下级 {group.totalCount} 个账号</span></summary>
      <div className="space-y-3 border-t p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{group.path}</span><div className="flex gap-2"><GoalButton groupName={group.name} name={group.path}/><Link href={"/ups?group="+encodeURIComponent(group.name)} className="px-2 py-1 text-sm text-[var(--app-primary)]">查看全部账号（含下级）</Link></div></div>
        {direct.length>0 && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{direct.map(a=><Link key={a.id} href={"/ups?q="+encodeURIComponent(a.mid)} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{creatorDisplayName(a)}{a.note&&<span className="mt-1 block line-clamp-2 whitespace-pre-wrap break-words text-xs text-amber-800" title={a.note}>备注：{a.note}</span>}<span className="mt-1 block text-xs text-slate-400">UID {a.mid}</span></Link>)}</div>}
        {children.length>0 && <div className="space-y-3 border-l-2 border-[var(--app-primary-ring)] pl-3">{children.map(render)}</div>}
        {!direct.length && !children.length && <p className="text-xs text-slate-400">暂无账号或下级分组</p>}
      </div>
    </details>;
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">四级分组</h1><p className="mt-1 text-sm text-slate-500">展开目录查看各级账号，父级月目标统计全部下级账号。</p></div><GroupManager groups={groups}/></div><div className="space-y-3">{groups.filter(g=>!g.parentName).map(render)}</div></div>;
}


"use client";
import { GoalButton } from "@/components/goal-button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { BarChart3, MoreHorizontal, Pause, Play, RefreshCw, Settings, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupComboboxInput } from "@/components/group-combobox-input";
import { RiskControlCookieDialog } from "@/components/risk-control-cookie-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRiskControlMessage } from "@/lib/risk-control";
import { creatorDisplayName, CREATOR_ALIAS_LIMIT, CREATOR_NOTE_LIMIT } from "@/lib/creator-personal";

export function UpRowActions({ id, status, name, alias, note, groupName, groups }: {
  id:string; status:string; name:string; alias?:string|null; note?:string|null; groupName:string;
  groups:Array<string|{name:string;path?:string}>;
}) {
  const router=useRouter(),displayName=creatorDisplayName({ name,alias });
  const [dialog,setDialog]=useState<"NOTE"|"SETTINGS"|null>(null);
  const [riskDialogOpen,setRiskDialogOpen]=useState(false);
  const [riskMessage,setRiskMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [isPending,startTransition]=useTransition();

  async function mutate(url:string,init:RequestInit) {
    setError(null);
    try {
      const response=await fetch(url,init);
      const payload=await response.json() as {ok:boolean;error?:string};
      if(!response.ok||!payload.ok) {
        const message=payload.error||"操作失败";
        if(isRiskControlMessage(message)){setRiskMessage(message);setRiskDialogOpen(true);}
        else setError(message);
        return false;
      }
      router.refresh(); return true;
    } catch {
      setError("连接失败，内容尚未保存，请保留输入并重试。"); return false;
    }
  }
  function openDialog(mode:"NOTE"|"SETTINGS"){setError(null);setDialog(mode);}
  function onSubmit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const body={alias:form.get("alias"),note:form.get("note"),...(dialog==="SETTINGS"?{groupName:form.get("groupName")||"未分组"}:{})};
    startTransition(async()=>{if(await mutate("/api/ups/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)}))setDialog(null);});
  }
  return <div className="flex flex-wrap items-center justify-center gap-1">
    <GoalButton creatorId={id} name={displayName}/>
    <Button variant="ghost" size="sm" className={"h-7 gap-1 px-2 text-xs "+(note?"text-amber-800 bg-amber-50":"text-slate-600")} disabled={isPending} title={note?"查看或编辑备注":"添加备注和本地显示名称"} data-creator-note-trigger aria-label={displayName+" 备注"} onClick={()=>openDialog("NOTE")}>
      <StickyNote className="size-3.5"/>备注
    </Button>
    {error&&!dialog&&<span role="alert" className="max-w-48 text-xs text-rose-600">{error}</span>}
    <Button asChild variant="ghost" size="icon" className="size-6 text-slate-700" title="趋势"><Link href={"/ups/"+id+"/trends"} aria-label={displayName+" 趋势"}><BarChart3 className="size-3.5"/></Link></Button>
    <Button variant="ghost" size="icon" className="size-6 text-slate-700" disabled={isPending} title="立即同步" onClick={()=>startTransition(async()=>{await mutate("/api/ups/"+id+"/sync",{method:"POST"});})}><RefreshCw className="size-3.5"/></Button>
    <Button variant="ghost" size="icon" className="size-6 text-slate-700" disabled={isPending} title="设置" onClick={()=>openDialog("SETTINGS")}><Settings className="size-3.5"/></Button>
    <Dialog open={dialog!==null} onOpenChange={open=>{if(!isPending&&!open)setDialog(null);}}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialog==="NOTE"?"账号备注与显示名称":"UP 主设置"}</DialogTitle>
          <DialogDescription>B站昵称：{name}。本地显示名和备注独立保存，采集不会覆盖。</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor={"alias-"+id}>本地显示名称（可选）</Label>
            <Input id={"alias-"+id} name="alias" defaultValue={alias??""} placeholder={name} maxLength={CREATOR_ALIAS_LIMIT} disabled={isPending}/>
            <p className="text-xs text-slate-500">仅修改本系统中的显示，留空使用 B站昵称。</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={"note-"+id}>备注 / 待办事项</Label>
            <textarea id={"note-"+id} name="note" defaultValue={note??""} maxLength={CREATOR_NOTE_LIMIT} disabled={isPending} autoFocus={dialog==="NOTE"} rows={6} placeholder={"例如：\n周三跟进本月投稿进度\n月底检查播放目标完成情况"} className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"/>
            <p className="text-xs leading-5 text-slate-500">最多 5000 字，支持换行，下载 JSON 时会一起保存，可在另一台电脑上传恢复。重新采集、重复添加账号或导入数据不会清空已有本地备注；清空后保存可删除备注。</p>
          </div>
          {dialog==="SETTINGS"&&<div className="space-y-2"><Label htmlFor={"group-"+id}>分组</Label><GroupComboboxInput id={"group-"+id} name="groupName" defaultValue={groupName} groups={groups}/></div>}
          {error&&<p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <Button type="submit" disabled={isPending} className="w-full bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)]">{isPending?"保存中…":"保存"}</Button>
        </form>
      </DialogContent>
    </Dialog>
    <RiskControlCookieDialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen} message={riskMessage}/>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-6 text-slate-700" disabled={isPending} title="更多操作"><MoreHorizontal className="size-3.5"/></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={()=>startTransition(async()=>{await mutate("/api/ups/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:status==="PAUSED"?"MONITORING":"PAUSED"})});})}>{status==="PAUSED"?<Play className="size-4"/>:<Pause className="size-4"/>}{status==="PAUSED"?"恢复监控":"暂停监控"}</DropdownMenuItem>
        <DropdownMenuSeparator/>
        <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onClick={()=>startTransition(async()=>{await mutate("/api/ups/"+id,{method:"DELETE"});})}><Trash2 className="size-4"/>删除</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

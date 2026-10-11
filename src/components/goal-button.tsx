"use client";
import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GOAL_METRICS, GOAL_LABELS, goalStatus, type GoalTargets, type GoalMetric } from "@/lib/goal-format";
import type { WeeklyMetrics } from "@/lib/weekly";

export function GoalSummary({ targets, actual, complete }: { targets: GoalTargets; actual: WeeklyMetrics; complete: boolean }) {
  const state = goalStatus(targets, actual, complete);
  if (!state.configured) return null;
  return <details className="my-2 rounded-lg border border-slate-200 bg-white p-2 text-xs"><summary className={`cursor-pointer font-medium ${!complete ? "text-amber-700" : state.reached === state.configured ? "text-emerald-700" : "text-slate-600"}`}>目标：{state.status} · {state.reached}/{state.configured} 项达到数值</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{GOAL_METRICS.filter(k => targets[k] !== undefined).map(k => <div key={k}><span>{GOAL_LABELS[k]}</span><span className="float-right tabular-nums">{actual[k].toLocaleString()} / {targets[k]!.toLocaleString()}</span><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${!complete ? "bg-amber-400" : actual[k] >= targets[k]! ? "bg-emerald-500" : "bg-[var(--app-primary)]"}`} style={{ width: `${targets[k] === 0 ? 100 : Math.min(100, actual[k] / targets[k]! * 100)}%` }} /></div></div>)}</div></details>;
}

type Progress = { targets: GoalTargets; actual: WeeklyMetrics; complete: boolean; start: string; end: string; collectedAt: string | null };
const date = (v: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(new Date(v));
export function GoalButton({ creatorId, groupName, name }: { creatorId?: string; groupName?: string; name: string }) {
  const [open, setOpen] = useState(false);
  const period = "MONTH";
  const [progress, setProgress] = useState<Progress | null>(null);
  const [fields, setFields] = useState<Partial<Record<GoalMetric, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    const params = new URLSearchParams({ period, ...(creatorId ? { creatorId } : { groupName: groupName! }) });
    fetch(`/api/goals?${params}`, { cache: "no-store" }).then(async response => { const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || "加载目标失败"); return payload.data as Progress; }).then(data => { if (active) { setProgress(data); setFields(Object.fromEntries(GOAL_METRICS.map(k => [k, data.targets[k] === undefined ? "" : String(data.targets[k])]))); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, period, creatorId, groupName]);
  function prepare() { setLoading(true); setError(""); setMessage(""); setProgress(null); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const targets: GoalTargets = {};
      for (const key of GOAL_METRICS) if (fields[key]?.trim()) { const value = Number(fields[key]); if (!Number.isSafeInteger(value) || value < 0) throw new Error("目标请填写非负整数，留空表示不设置。"); targets[key] = value; }
      const response = await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorId, groupName, period, targets }) });
      const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || "保存失败");
      setProgress(p => p ? { ...p, targets } : p); setMessage(Object.keys(targets).length ? "已保存，后续每个周期沿用这些目标。" : "已清除本周期类型的目标。");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败"); }
    finally { setSaving(false); }
  }
  return <><Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[var(--app-primary)]" aria-label={`${name}月目标`} onClick={() => { prepare(); setOpen(true); }}><Target className="size-3.5" />月目标</Button><Dialog open={open} onOpenChange={v => { if (!saving) setOpen(v); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{name} · {creatorId ? "账号月目标" : "分组月目标"}</DialogTitle><DialogDescription>目标数值自动沿用；每月 1 日重新统计进度。留空表示不设置，全部留空保存即可清除。</DialogDescription></DialogHeader>
    {loading ? <p className="py-8 text-center text-slate-500">正在读取目标和进度…</p> : progress && <form onSubmit={save} className="space-y-4"><div className="rounded-lg bg-slate-50 p-3 text-sm"><b>本月 {date(progress.start)} — {date(new Date(new Date(progress.end).getTime() - 1).toISOString())}</b><p className="mt-1 text-xs text-slate-500">播放与互动为本期发布视频截至最近采集时的累计值。{!progress.complete && "数据待补齐，暂不判定是否达标。"}</p>{progress.collectedAt && <p className="mt-1 text-xs text-slate-400">最近采集：{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(progress.collectedAt))}</p>}</div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{GOAL_METRICS.map(key => <label key={key} className="space-y-1 text-sm"><span className="block font-medium">{GOAL_LABELS[key]}</span><Input type="number" step={1} min={0} max={Number.MAX_SAFE_INTEGER} placeholder="未设置" value={fields[key] ?? ""} onChange={event => setFields(f => ({ ...f, [key]: event.target.value }))} disabled={saving} /><span className="block text-xs text-slate-400">已采集 {progress.actual[key].toLocaleString()}</span></label>)}</div>
    <GoalSummary targets={progress.targets} actual={progress.actual} complete={progress.complete} /><Button type="submit" disabled={saving}>{saving ? "保存中…" : "保存目标"}</Button></form>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
  </DialogContent></Dialog></>;
}

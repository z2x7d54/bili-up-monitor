"use client";
import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, LoaderCircle } from "lucide-react";
import { resolveReportRange } from "@/lib/report-range";

type Props = {
  params: Record<string, string | undefined>;
  applied: { from: string; to: string; mode: string; label: string };
  currentMonth: string;
  currentDate: string;
};
const options = [
  { value: "1m", label: "本月" },
  { value: "3m", label: "近3个月" },
  { value: "6m", label: "近6个月" },
  { value: "month", label: "指定月份" },
  { value: "custom", label: "自定义日期" },
] as const;

export function ReportFilters({ params, applied, currentMonth, currentDate }: Props) {
  const router = useRouter(), pathname = usePathname();
  const container = useRef<HTMLDivElement>(null);
  const initial = applied.mode === "month" && !params.month ? "1m" : applied.mode;
  const [mode, setMode] = useState(initial);
  const [month, setMonth] = useState(params.month || currentMonth);
  const [from, setFrom] = useState(params.from || applied.from);
  const [to, setTo] = useState(params.to || applied.to);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const inputClass = "h-9 rounded-md border border-slate-200 bg-white px-3 text-sm disabled:opacity-60";
  function apply(nextMode: string, changes: { month?: string; from?: string; to?: string } = {}) {
    const values = { period: nextMode, month: changes.month ?? month, from: changes.from ?? from, to: changes.to ?? to };
    setMode(nextMode); setError("");
    try { resolveReportRange(values); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "请选择有效时间"); return; }
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    const form = container.current?.closest("form");
    if (form) for (const [key, value] of new FormData(form)) if (typeof value === "string") query.set(key, value);
    for (const key of ["period", "month", "from", "to", "page"]) query.delete(key);
    query.set("period", nextMode);
    if (nextMode === "month") query.set("month", values.month);
    if (nextMode === "custom") { query.set("from", values.from); query.set("to", values.to); }
    startTransition(() => router.push(pathname + "?" + query.toString(), { scroll: false }));
  }
  return <div ref={container} className="space-y-3 border-b border-slate-100 pb-4">
    <input type="hidden" name="period" value={mode} />
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-2 font-medium text-slate-700"><CalendarDays className="size-4" />统计范围</span>
      <div role="group" aria-label="选择统计时间" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {options.map(option => <button key={option.value} type="button" aria-pressed={mode === option.value} disabled={pending}
          onClick={() => apply(option.value)}
          className={"rounded-md px-3 py-2 text-sm transition disabled:opacity-60 " + (mode === option.value ? "bg-white font-semibold text-[var(--app-primary)] shadow-sm" : "text-slate-600 hover:bg-white/70")}>{option.label}</button>)}
      </div>
      <span className="text-xs text-slate-400">选择后自动更新</span>
    </div>
    {mode === "month" && <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">选择月份<input type="month" name="month" value={month} max={currentMonth} required disabled={pending} className={inputClass}
        onChange={event => { const value = event.target.value; setMonth(value); if (value) apply("month", { month: value }); else setError("请选择月份"); }} /></label>
      <span className="text-xs text-slate-400">统计该月1日至月末；当前月统计到今天</span>
    </div>}
    {mode === "custom" && <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">从<input type="date" name="from" value={from} max={currentDate} required disabled={pending} className={inputClass}
        onChange={event => { const value = event.target.value; setFrom(value); if (value) apply("custom", { from: value }); else setError("请选择开始日期"); }} /></label>
      <label className="flex items-center gap-2 text-sm text-slate-600">至<input type="date" name="to" value={to} min={from} max={currentDate} required disabled={pending} className={inputClass}
        onChange={event => { const value = event.target.value; setTo(value); if (value) apply("custom", { to: value }); else setError("请选择结束日期"); }} /></label>
      <span className="text-xs text-slate-400">包含结束当天，选好起止日期后自动更新</span>
    </div>}
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--app-primary-soft)] px-3 py-2 text-sm">
      {pending ? <><LoaderCircle className="size-4 animate-spin text-[var(--app-primary)]" /><span>正在更新统计数据…</span></> : <>
        <span className="text-slate-600">当前生效：</span><strong className="tabular-nums text-slate-800">{applied.from.replaceAll("-", "/")} — {applied.to.replaceAll("-", "/")}</strong><span className="text-xs text-slate-500">北京时间</span>
      </>}
    </div>
    {(mode === "3m" || mode === "6m") && <p className="text-xs text-slate-500">包含本月的连续{mode === "3m" ? "3" : "6"}个自然月，本月数据统计到今天。</p>}
  </div>;
}

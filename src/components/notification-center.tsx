"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { GoalSummary } from "@/components/goal-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/view-format";
import { BUSINESS_TIME_ZONE } from "@/lib/monthly";
import type { NewWeeklyAccount, NotificationInbox, WeeklyNotification, WeeklyReport } from "@/lib/weekly";

const date = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: BUSINESS_TIME_ZONE, month: "2-digit", day: "2-digit" }).format(new Date(value));
const time = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: BUSINESS_TIME_ZONE, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const period = (report: WeeklyReport) => `${report.weekKey.slice(0, 4)}年 ${date(report.start)} — ${date(new Date(new Date(report.end).getTime() - 1).toISOString())}`;

function NewAccounts({ accounts }: { accounts: NewWeeklyAccount[] }) {
  return <details open={accounts.length > 0 && accounts.length <= 4} className="rounded-xl border border-[var(--app-primary-ring)] bg-[var(--app-primary-soft)] p-4">
    <summary className="flex cursor-pointer items-center justify-between gap-3"><span className="font-semibold">本月新增监控账号 <span className="text-xs font-normal text-slate-500">· 展开查看</span></span><span className="text-lg font-bold tabular-nums text-[var(--app-primary)]">{accounts.length} 个</span></summary>
    {accounts.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{accounts.map(account => <div key={account.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2">
      <div className="min-w-0"><div className="truncate font-medium">{account.name}</div><div className="truncate text-xs text-slate-500">{account.groupName} · UID {account.mid}</div></div><span className="shrink-0 text-xs text-slate-500">{date(account.createdAt)} 添加</span>
    </div>)}</div> : <p className="mt-2 text-xs text-slate-500">本月暂未添加新账号。</p>}
  </details>;
}

export function MonthlyReportView({ report }: { report: WeeklyReport }) {
  const previous = "上月";
  const cards = [
    [`${previous}投稿`, report.totals.posts, "条"], [`${previous}视频播放`, report.totals.views, ""],
    [`${previous}视频点赞`, report.totals.likes, ""], ["待补齐账号", report.totals.pending, "个"],
  ] as const;
  return <div className="space-y-4">
    <div><h3 className="text-xl font-semibold">{period(report)} 月报</h3><p className="mt-1 text-xs text-slate-500">{report.totals.groups} 个分组 · {report.totals.accounts} 个账号 · {report.totals.added} 个{previous}新增监控 · {time(report.generatedAt)} 生成</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value, unit], index) => <div key={label} className={`rounded-xl border p-4 ${index === 0 ? "border-[var(--app-primary-ring)] bg-[var(--app-primary-soft)]" : "border-slate-100 bg-slate-50"}`}>
      <div className="text-xs text-slate-500">{label}</div><div className={`mt-2 text-3xl font-bold tabular-nums ${index === 0 ? "text-[var(--app-primary)]" : index === 3 && value ? "text-amber-600" : "text-slate-900"}`}>{formatNumber(value)}<span className="ml-1 text-xs font-normal">{unit}</span></div>
    </div>)}</div>
    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">北京时间上月 1 日至月末。互动数据为{previous}发布视频截至报告生成时的累计值；粉丝为生成时数量。目标为生成时保存的配置。{report.totals.pending > 0 && "待补齐账号仅列出已采集数据，不能据此认定零投稿。"}</p>
    {report.groups.map(group => <details key={group.name} open className="overflow-hidden rounded-xl border border-slate-200">
      <summary className="cursor-pointer bg-slate-50 px-4 py-3"><span className="font-semibold">{group.path ?? group.name}</span><span className="ml-2 text-xs text-slate-500">{group.accounts.length} 个账号</span>
        <span className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs sm:ml-5 sm:inline-flex"><span>投稿 <b className="text-base text-[var(--app-primary)]">{group.posts}</b></span><span>播放 <b>{formatNumber(group.views)}</b></span><span>点赞 <b>{formatNumber(group.likes)}</b></span>{group.pending > 0 && <span className="text-amber-600">{group.pending} 个待补齐</span>}</span>
      </summary>
      {group.goal && <div className="px-4"><GoalSummary targets={group.goal} actual={group.goalActual ?? group} complete={group.goalComplete ?? (group.pending === 0 && group.accounts.length > 0)} /></div>}
      {group.accounts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[840px] text-left text-sm">
        <thead className="border-y border-slate-100 text-xs text-slate-500"><tr>{["账号", "投稿", "播放", "点赞", "评论", "采集状态", "目标", "其他数据"].map(label => <th key={label} className="px-4 py-2 font-normal">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{group.accounts.map(account => <tr key={account.id} className="align-top">
          <td className="px-4 py-3"><div className="max-w-48 truncate font-medium" title={account.name}>{account.name}</div><div className="mt-1 text-xs text-slate-400">粉丝 {formatNumber(account.followers)}{account.addedThisWeek && <span className="ml-2 text-[var(--app-primary)]">{previous}新增</span>}</div></td>
          <td className="px-4 py-3 text-lg font-bold tabular-nums text-[var(--app-primary)]">{!account.complete && account.posts === 0 ? "—" : account.posts}</td>
          <td className="px-4 py-3 tabular-nums">{!account.complete && account.posts === 0 ? "—" : formatNumber(account.views)}</td>
          <td className="px-4 py-3 tabular-nums">{!account.complete && account.posts === 0 ? "—" : formatNumber(account.likes)}</td>
          <td className="px-4 py-3 tabular-nums">{!account.complete && account.posts === 0 ? "—" : formatNumber(account.comments)}</td>
          <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${!account.complete ? "bg-amber-50 text-amber-700" : account.posts === 0 ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>{!account.complete ? "待补齐" : account.posts === 0 ? `${previous}无投稿` : "已完整采集"}</span></td>
          <td className="px-4 py-3">{account.goal ? <GoalSummary targets={account.goal} actual={account} complete={account.complete} /> : <span className="text-xs text-slate-400">未设置</span>}</td>
          <td className="px-4 py-3"><details><summary className="cursor-pointer text-xs text-slate-500">展开</summary><dl className="mt-2 grid min-w-32 grid-cols-2 gap-x-3 gap-y-1 text-xs">{[["弹幕", account.danmaku], ["投币", account.coins], ["收藏", account.favorites], ["分享", account.shares]].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="tabular-nums">{!account.complete && account.posts === 0 ? "—" : formatNumber(Number(value))}</dd></div>)}</dl></details></td>
        </tr>)}</tbody>
      </table></div> : <p className="px-4 py-4 text-xs text-slate-400">该分组暂无监控账号。</p>}
    </details>)}
  </div>;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error || "通知加载失败，请稍后重试");
  return body.data as T;
}

export function NotificationCenter() {
  const [inbox, setInbox] = useState<NotificationInbox | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"popup" | "history">("history");
  const [selected, setSelected] = useState<WeeklyNotification | null>(null);
  const [popupReports, setPopupReports] = useState<WeeklyNotification[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const openRef = useRef(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const historyOperation = useRef(0);
  const pageRef = useRef(1);
  const load = useCallback(async (page = 1) => {
    const request = ++revision.current;
    const data = await api<NotificationInbox>(`/api/notifications?page=${page}`);
    if (alive.current && request === revision.current) { pageRef.current = data.page; setInbox(data); }
    return data;
  }, []);
  const read = useCallback(async (notification: WeeklyNotification) => {
    setSelected(notification);
    ++revision.current;
    if (!notification.readAt) {
      await api("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notification.id }) });
      ++revision.current;
      const readAt = new Date().toISOString();
      // A different tab may already have read this report. Reconcile even when count=0.
      if (alive.current) setSelected(current => current?.id === notification.id ? { ...current, readAt } : current);
    }
    // The database count is authoritative; never subtract from a potentially stale badge.
    await load(pageRef.current);
  }, [load]);
  useEffect(() => {
    alive.current = true;
    const requestRevision = revision;
    async function check() {
      if (busy.current || document.visibilityState !== "visible" || openRef.current || document.querySelector('[role="dialog"]') || document.activeElement?.matches("input,textarea,select,[contenteditable=true]")) return;
      busy.current = true;
      try {
        await load();
        if (!alive.current || openRef.current || document.querySelector('[role="dialog"]') || document.activeElement?.matches("input,textarea,select,[contenteditable=true]")) return;
        const result = await api<{ notification: WeeklyNotification | null; notifications: WeeklyNotification[] }>("/api/notifications/popup", { method: "POST" });
        if (result.notification && alive.current && !openRef.current) {
          ++revision.current;
          setPopupReports(result.notifications); setSelected(result.notification); setMode("popup"); setError(""); openRef.current = true; setOpen(true);
          await load();
        }
      } catch { /* Background failures must not interrupt the current page. */ }
      finally { busy.current = false; }
    }
    void check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { alive.current = false; ++requestRevision.current; window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [load]);

  async function history(page = 1) {
    const operation = ++historyOperation.current;
    ++revision.current;
    openRef.current = true; setOpen(true); setMode("history"); setError(""); setLoading(true);
    try {
      await api("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
      ++revision.current;
      if (!alive.current || operation !== historyOperation.current || !openRef.current) return;
      const data = await load(page);
      if (operation !== historyOperation.current || !openRef.current) return;
      setSelected(data.notifications[0] ?? null);
      if (data.notifications[0] && !data.notifications[0].readAt) await read(data.notifications[0]);
    } catch (failure) { if (operation === historyOperation.current) setError(failure instanceof Error ? failure.message : "加载失败"); }
    finally { if (operation === historyOperation.current) setLoading(false); }
  }

  return <>
    <Button variant="outline" size="sm" className="relative mb-4 gap-2" onClick={() => void history()} aria-label={`通知${inbox?.unreadCount ? `，${inbox.unreadCount} 条未读` : ""}`}><Bell className="size-4" />通知{!!inbox?.unreadCount && <span className="rounded-full bg-[var(--app-primary)] px-1.5 text-[10px] leading-4 text-white">{inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}</span>}</Button>
    <Dialog open={open} onOpenChange={value => { openRef.current = value; setOpen(value); }}>
      <DialogContent className="top-[7vh] flex max-h-[86vh] -translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12"><DialogTitle className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5 text-[var(--app-primary)]" />{mode === "popup" ? "经营报告提醒" : "通知中心"}</DialogTitle><DialogDescription>{mode === "popup" ? "每月 1 日提醒上月月报，只弹出一次，之后可在通知中查看。" : "自动保存月报，选择月份查看历史分组、账号数据及月目标完成情况。"}</DialogDescription></DialogHeader>
        {mode === "history" ? <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[210px_minmax(0,1fr)]">
          <aside className="border-b bg-slate-50 p-3 md:border-r md:border-b-0"><div className="mb-2 px-2 text-xs text-slate-400">历史报告 · 共 {inbox?.total ?? 0} 份</div><div className="flex gap-2 overflow-x-auto md:block md:space-y-2">{inbox?.notifications.map(notification => <button key={notification.id} onClick={() => void read(notification).catch(() => setError("标记已读失败，请重试"))} className={`block shrink-0 rounded-lg border px-3 py-3 text-left md:w-full ${selected?.id === notification.id ? "border-[var(--app-primary-ring)] bg-white" : "border-transparent hover:bg-white"}`}><div className="text-sm font-medium">月报 · {period(notification.report)}{!notification.readAt && <span className="ml-2 inline-block size-1.5 rounded-full bg-[var(--app-primary)]" />}</div><div className="mt-1 text-xs text-slate-400">{notification.report.totals.posts} 条投稿 · {notification.report.totals.accounts} 个账号</div></button>)}</div>
            {inbox && inbox.total > inbox.pageSize && <div className="mt-3 flex items-center justify-between"><Button variant="ghost" size="icon-sm" aria-label="上一页通知" disabled={inbox.page <= 1 || loading} onClick={() => void history(inbox.page - 1)}><ChevronLeft className="size-4" /></Button><span className="text-xs">{inbox.page}/{Math.ceil(inbox.total / inbox.pageSize)}</span><Button variant="ghost" size="icon-sm" aria-label="下一页通知" disabled={inbox.page * inbox.pageSize >= inbox.total || loading} onClick={() => void history(inbox.page + 1)}><ChevronRight className="size-4" /></Button></div>}
          </aside><div className="space-y-5 p-5">{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{loading ? <p className="py-10 text-center text-slate-400">正在加载通知…</p> : <>{inbox && <NewAccounts accounts={inbox.newMonthlyAccounts ?? inbox.newAccounts} />}{selected ? <MonthlyReportView report={selected.report} /> : <div className="py-12 text-center text-slate-400"><Inbox className="mx-auto mb-3 size-8" /><p>暂无历史报告</p><p className="mt-2 text-xs">添加监控账号后，系统会自动保存月报。</p></div>}</>}</div>
        </div> : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{popupReports.length > 1 && <div className="flex gap-2">{popupReports.map(n => <Button key={n.id} variant={n.id === selected?.id ? "default" : "outline"} onClick={() => setSelected(n)}>上月月报</Button>)}</div>}{inbox && <NewAccounts accounts={inbox.newMonthlyAccounts ?? inbox.newAccounts} />}{selected && <MonthlyReportView report={selected.report} />}</div>}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-white px-5 py-3">{mode === "popup" && <Button variant="outline" onClick={() => void history()}>查看历史通知</Button>}<Button onClick={() => { openRef.current = false; setOpen(false); }}>知道了</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}

import { reportDateKey } from "@/lib/report-range";
import Image from "next/image";
import Link from "next/link";
import { getMonthlyReport } from "@/lib/monthly-report";
import { prisma } from "@/lib/db";
import { BUSINESS_TIME_ZONE } from "@/lib/monthly";
import { formatNumber } from "@/lib/view-format";
import { UpRowActions } from "@/components/up-row-actions";
import { GroupManager } from "@/components/group-manager";
import { UpCreateForm } from "@/components/up-create-form";
import { listCreatorGroups } from "@/lib/groups";
import { compareMonthlyAccounts } from "@/lib/monthly-sort";
import { ReportFilters } from "@/components/report-filters";
import { PeriodComparison } from "@/components/period-comparison";
import { ExcelExportButton } from "@/components/excel-export-button";

function dateLabel(value: Date | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { timeZone: BUSINESS_TIME_ZONE, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value) : "暂无记录";
}

export async function MonthlyDashboard({ params }: { params: Record<string, string | undefined> }) {
  const groups = await listCreatorGroups();
  let report;
  try { report = await getMonthlyReport({ ...params, overdueDays: params.days, query: params.accountQuery }); }
  catch (error) { return <section className="space-y-3"><h1 className="text-2xl font-semibold">经营看板</h1><p role="alert" className="text-rose-600">{error instanceof Error ? error.message : "时间范围不正确"}</p><Link href="/">重置筛选</Link></section>; }
  const current = report.range.isCurrentMonth;
  const label = current ? "本月" : "所选期间";
  const group = params.group || "ALL";
  const filter = params.publication || "ALL";
  const sort = params.accountSort || "today";
  const q = params.accountQuery?.trim().toLowerCase() || "";
  const accounts = report.accounts.filter(c =>
    (!q || c.name.toLowerCase().includes(q) || c.biliName.toLowerCase().includes(q) || c.note?.toLowerCase().includes(q) || c.mid.includes(q)) &&
    (filter === "ALL" || (filter === "NO_MONTH_POSTS" ? c.complete && c.monthCount === 0 : c.state === filter)),
  ).sort((a, b) => compareMonthlyAccounts(a, b, sort));
  const recentRows = accounts.length ? await prisma.upCreator.findMany({
    where: { id: { in: accounts.map(account => account.id) } },
    select: { id: true, contents: {
      where: { publishedAt: { lte: report.generatedAt } },
      orderBy: [{ publishedAt: "desc" }, { bvid: "asc" }],
      take: 6,
    } },
  }) : [];
  const recentByCreator = new Map(recentRows.map(row => [row.id, row.contents]));
  function filterHref(publication: string) { const next = new URLSearchParams(); for (const [key,value] of Object.entries(params)) if (value) next.set(key,value); next.set("publication",publication); return "/?" + next.toString(); }
  const cards = [
    { label: label + "更新视频", value: report.totals.monthCount, sub: `今天 ${report.totals.todayCount} 条` },
    { label: label + "视频总播放", value: report.totals.views, sub: "所选期间发布视频的累计播放" },
    { label: label + "视频总点赞", value: report.totals.likes, sub: "所选期间发布视频的累计点赞" },
    { label: label + "未更新账号", value: report.totals.noMonthPosts, sub: `全部 ${report.totals.accountCount} 个账号 · ${report.totals.overdueCount} 个断更` },
  ];
  return (
    <section className="space-y-4" aria-label="经营看板">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{current ? "本月经营看板" : "经营看板"}</h1>
          <p className="mt-1 text-sm text-slate-500">{report.range.label} · 北京时间 · 分组包含下级账号</p></div>
        <div className="flex flex-wrap gap-2"><ExcelExportButton params={params} /><UpCreateForm groups={groups.map(g => ({ name: g.name,path:g.path }))} /><GroupManager groups={groups} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => <div key={card.label} className="rounded-lg border border-black/[0.055] bg-white p-4">
          <div className="text-sm text-slate-500">{card.label}</div><div className="my-2 text-3xl font-semibold text-[var(--app-primary)]">{formatNumber(card.value)}</div>
          <div className="text-xs text-slate-400">{card.sub}</div></div>)}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href={filterHref("NO_MONTH_POSTS")} className="rounded-full bg-amber-50 px-3 py-2 text-amber-800">{label}未更新 {report.totals.noMonthPosts}</Link>
        <Link href={filterHref("OVERDUE")} className="rounded-full bg-rose-50 px-3 py-2 text-rose-700">连续 {report.overdueDays} 天未投稿 {report.totals.overdueCount}</Link>
        <Link href={filterHref("PENDING")} className="rounded-full bg-slate-100 px-3 py-2 text-slate-600">待补齐数据 {report.totals.pendingCount}</Link>
      </div>
      {report.totals.pendingCount > 0 && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {report.totals.pendingCount} 个账号所选期间数据待补齐或采集失败。汇总显示已入库数据；这些账号暂不判定为断更。可点击账号的采集按钮，或等待监控任务执行。
      </p>}
      <form action="/" className="flex flex-wrap items-end gap-3 rounded-lg border border-black/[0.055] p-4 text-sm">
        <div className="w-full"><ReportFilters key={[report.range.mode,report.range.from,report.range.to,params.month].join(":")} params={params} applied={{ from:report.range.from,to:report.range.to,mode:report.range.mode,label:report.range.label }} currentMonth={report.monthKey} currentDate={reportDateKey(report.generatedAt)} /></div>
        <label className="grid gap-1">搜索账号<input name="accountQuery" defaultValue={q} placeholder="名称、备注或 UID" className="h-9 rounded-md border px-2" /></label>
        <label className="grid gap-1">分组<select name="group" defaultValue={group} className="h-9 rounded-md border px-2"><option value="ALL">全部分组</option>{groups.map(g => <option key={g.name} value={g.name}>{g.path}</option>)}</select></label>
        <label className="grid gap-1">更新状态<select name="publication" defaultValue={filter} className="h-9 rounded-md border px-2">
          <option value="ALL">全部账号</option><option value="NO_MONTH_POSTS">{label}未更新</option><option value="OVERDUE">连续多天未投稿</option><option value="PENDING">待补齐数据</option><option value="UPDATED">近期已更新</option><option value="NO_VIDEOS">暂无投稿</option>
        </select></label>
        <label className="grid gap-1">排序<select name="accountSort" defaultValue={sort} className="h-9 rounded-md border px-2">
          <option value="today">今天投稿数 ↓</option><option value="month">{label}投稿数 ↓</option><option value="followers">粉丝数 ↓</option><option value="views">{label}视频播放 ↓</option><option value="updated_desc">更新时间：最新投稿优先 ↓</option><option value="updated_asc">更新时间：最早投稿优先 ↑</option><option value="oldest">最久未投稿优先</option>
        </select></label>
        <label className="grid gap-1">断更天数<input type="number" name="days" min={1} max={365} defaultValue={report.overdueDays} className="h-9 w-20 rounded-md border px-2" /></label>
        <button type="submit" className="h-9 rounded-md bg-[var(--app-primary)] px-4 text-white">筛选</button>
        <Link href="/" className="py-2 text-slate-500">重置</Link>
      </form>
      <PeriodComparison periods={report.periods} />
      <div className="text-sm text-slate-500">显示 {accounts.length} 个账号 · 展开账号可查看最近 6 条视频</div>
      <div className="space-y-3">
        {accounts.length === 0 && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">暂无符合条件的账号，添加账号并执行采集后即可查看。</div>}
        {accounts.map(account => {
          const recentVideos = recentByCreator.get(account.id) ?? [];
          const stateText = account.state === "PENDING" ? "数据待补齐" : account.state === "OVERDUE" ? `${account.days} 天未投稿` : account.state === "NO_MONTH_POSTS" ? label + "未更新" : account.state === "NO_VIDEOS" ? "暂无投稿" : "近期已更新";
          const tone = account.state === "OVERDUE" ? "bg-rose-50 text-rose-700" : account.state === "NO_MONTH_POSTS" || account.state === "NO_VIDEOS" ? "bg-amber-50 text-amber-700" : account.state === "PENDING" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700";
          return <article key={account.id} className="rounded-lg border border-black/[0.055] bg-white p-4" data-account-id={account.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {account.avatarUrl ? <Image src={account.avatarUrl} alt="" width={40} height={40} className="size-10 rounded-full object-cover" /> : <div className="flex size-10 items-center justify-center rounded-full bg-pink-50 text-pink-500">{account.name.slice(0, 1)}</div>}
                <div><a href={`https://space.bilibili.com/${account.mid}`} target="_blank" rel="noreferrer" className="font-semibold">{account.name}</a><div className="mt-1 text-xs text-slate-500">{account.groupPath} · UID {account.mid}</div></div>
                <span className={`rounded-full px-2 py-1 text-xs ${tone}`}>{stateText}</span>
              </div>
              <UpRowActions id={account.id} status={account.status} name={account.biliName} alias={account.alias} note={account.note} groupName={account.groupName} groups={groups.map(g => ({ name: g.name,path:g.path }))} />
            </div>
            {account.alias && <p className="mt-2 text-xs text-slate-400">B站昵称：{account.biliName}</p>}
            {account.note && <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm"><span className="font-medium text-amber-800">备注 / 待办</span><p className="mt-1 whitespace-pre-wrap break-words text-slate-700 line-clamp-3" title={account.note}>{account.note}</p></div>}
            <div className="my-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
              <div className="text-slate-500">当前粉丝<strong className="mt-1 block text-lg text-slate-900">{formatNumber(account.followerCount)}</strong></div>
              <div className="text-slate-500">今天投稿<strong className="mt-1 block text-lg text-slate-900">{account.todayCount} 条</strong></div>
              <div className="text-slate-500">{label}投稿<strong className="mt-1 block text-lg text-[var(--app-primary)]">{account.monthCount} 条</strong></div>
              <div className="text-slate-500">{label}视频播放<strong className="mt-1 block text-lg text-slate-900">{formatNumber(account.monthViews)}</strong></div>
              <div className="text-slate-500">{label}视频点赞<strong className="mt-1 block text-lg text-slate-900">{formatNumber(account.monthLikes)}</strong></div>
              <div className="text-slate-500">最后投稿<span className="mt-1 block text-sm text-slate-900">{dateLabel(account.lastPublishedAt)}</span><span className="text-xs">采集：{dateLabel(account.lastVideoSyncAt)}</span></div>
            </div>
            {account.lastError && <p className="mb-3 break-words text-xs text-rose-600">采集异常：{account.lastError}</p>}
            <details className="group">
              <summary className="cursor-pointer text-sm text-[var(--app-primary)]">最近 6 条视频（已显示 {recentVideos.length} 条）</summary>
              {recentVideos.length === 0 ? <p className="mt-3 text-sm text-slate-500">暂无已采集的视频，请先执行采集。</p> :
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{recentVideos.map(video =>
                  <div key={video.id} className="overflow-hidden rounded-lg border border-black/[0.055]">
                    <a href={`https://www.bilibili.com/video/${video.bvid}`} target="_blank" rel="noreferrer">
                      {video.coverUrl ? <Image src={video.coverUrl} alt={video.title} width={320} height={180} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-slate-100 text-xs text-slate-400">暂无封面</div>}
                      <div className="line-clamp-2 px-3 pt-3 text-sm font-medium" title={video.title}>{video.title}</div>
                    </a>
                    <div className="px-3 pb-3"><div className="my-2 text-xs text-slate-400">{dateLabel(video.publishedAt)}</div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-600">
                        {[['播放', video.viewCount], ['点赞', video.likeCount], ['评论', video.replyCount], ['弹幕', video.danmakuCount], ['投币', video.coinCount], ['收藏', video.favoriteCount], ['分享', video.shareCount]].map(([label, value]) => <div key={String(label)}>{label} <span className="font-medium">{formatNumber(Number(value))}</span></div>)}
                      </div></div>
                  </div>)}</div>}
            </details>
          </article>;
        })}
      </div>
    </section>
  );
}

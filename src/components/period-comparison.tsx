import Image from "next/image";
import { formatNumber } from "@/lib/view-format";
import type { getMonthlyReport } from "@/lib/monthly-report";
export function PeriodComparison({ periods }: { periods: Awaited<ReturnType<typeof getMonthlyReport>>["periods"] }) {
  const max = Math.max(1,...periods.map(p=>p.posts));
  return <section className="space-y-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">月份对比</h2><p className="text-xs text-slate-500">按投稿月份汇总 · 播放和互动为截至最近采集的累计值</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{periods.map(p => <article key={p.key} className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between"><h3 className="font-medium">{p.label}</h3>{p.partial && <span className="text-xs text-slate-400">部分月份</span>}</div>
      <div className="my-3 grid grid-cols-3 gap-2 text-xs text-slate-500">{[["投稿",p.posts],["播放",p.views],["点赞",p.likes]].map(([label,value])=><div key={String(label)}>{label}<strong className="mt-1 block text-lg text-slate-900">{p.pending===p.accountCount && p.pending>0 && p.posts===0 ? "—" : formatNumber(Number(value))}</strong></div>)}</div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--app-primary)]" style={{width:(p.posts/max*100)+"%"}} /></div>
      {p.pending>0 && <p className="mt-2 text-xs text-amber-700">{p.pending} 个账号数据待补齐，当前仅显示已入库数据</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">{p.recentVideos.map(v=><a key={v.id} href={"https://www.bilibili.com/video/"+v.bvid} target="_blank" rel="noreferrer" title={v.title}>
        {v.coverUrl ? <Image src={v.coverUrl} alt={v.title} width={180} height={100} className="aspect-video w-full rounded object-cover" /> : <div className="aspect-video rounded bg-slate-100" />}
        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{v.title}</p>
      </a>)}</div>{!p.recentVideos.length && <p className="mt-3 text-xs text-slate-400">{p.pending ? "尚无可对比的视频记录" : "该时间范围暂无投稿"}</p>}
    </article>)}</div>
  </section>;
}

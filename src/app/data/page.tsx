import { reportDateKey } from "@/lib/report-range";
import Link from "next/link";
import { getMonthlyReport } from "@/lib/monthly-report";
import { getComparisonData } from "@/lib/comparison";
import { listCreatorGroups } from "@/lib/groups";
import { ReportFilters } from "@/components/report-filters";
import { PeriodComparison } from "@/components/period-comparison";
import { EntityComparison } from "@/components/entity-comparison";
import { formatNumber } from "@/lib/view-format";
export const dynamic="force-dynamic";
export default async function DataPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const raw=await searchParams,params=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]));
  const groups=await listCreatorGroups();
  let report;
  try {report=await getMonthlyReport({...params,query:params.accountQuery??params.q});}
  catch(e) {return <div className="space-y-4"><h1 className="text-2xl font-semibold">数据统计</h1><p role="alert" className="text-rose-600">{e instanceof Error?e.message:"日期参数不正确"}</p><Link href="/data">重置筛选</Link></div>;}
  const comparison=await getComparisonData(report,params.publication);
  const count=comparison.accounts.length,posts=comparison.creators.reduce((s,c)=>s+c.values.posts,0),views=comparison.creators.reduce((s,c)=>s+c.values.views,0),likes=comparison.creators.reduce((s,c)=>s+c.values.likes,0),pending=comparison.creators.filter(c=>!c.complete).length;
  return <div className="space-y-5"><div><h1 className="text-2xl font-semibold">数据统计</h1><p className="mt-1 text-sm text-slate-500">{report.range.label} · 按投稿时间统计 · 北京时间</p></div>
    <form action="/data" className="space-y-3 rounded-xl border p-4">{params.publication&&<input type="hidden" name="publication" value={params.publication}/>}<ReportFilters key={[report.range.mode,report.range.from,report.range.to,params.month].join(":")} params={params} applied={{ from:report.range.from,to:report.range.to,mode:report.range.mode,label:report.range.label }} currentMonth={report.monthKey} currentDate={reportDateKey(report.generatedAt)} /><div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="grid gap-1">分组<select name="group" defaultValue={params.group||"ALL"} className="h-9 rounded border px-2"><option value="ALL">全部分组</option>{groups.map(g=><option key={g.name} value={g.name}>{g.path}</option>)}</select></label>
      <label className="grid gap-1">账号<input name="accountQuery" defaultValue={params.accountQuery??params.q} placeholder="名称或 UID" className="h-9 rounded border px-2"/></label>
      <button className="h-9 rounded bg-[var(--app-primary)] px-4 text-white">统计</button><Link href="/data" className="py-2 text-slate-500">重置</Link>
    </div></form>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["账号",count],["投稿",posts],["播放",views],["点赞",likes]].map(([label,value])=><div key={String(label)} className="rounded-xl border p-4 text-sm text-slate-500">{label}<strong className="mt-2 block text-2xl text-slate-900">{formatNumber(Number(value))}</strong></div>)}</div>
    {pending>0 && <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">{pending} 个账号数据待补齐，数字为已入库部分。历史数据需在服务成功采集后补齐。</p>}
    <EntityComparison key={[report.range.from,report.range.to,params.period,params.group,params.accountQuery,params.publication].join(":")} creators={comparison.creators} groups={comparison.groups} params={params} currentMonth={report.range.isCurrentMonth} rangeLabel={report.range.label}/>
    <PeriodComparison periods={comparison.periods}/>
    <p className="text-xs leading-6 text-slate-500">Excel 与当前对比范围绑定，仅包含勾选的博主，或勾选的分组及其账号；同时保留四级分组路径、所选期间的投稿及互动指标。选定 A／B 后附带差值表；本月附带目标完成情况，并保留月份对比和视频明细。UID/BV 号按文本保存，数值可直接用于排序、求和与透视表。</p>
  </div>;
}

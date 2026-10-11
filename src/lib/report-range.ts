import { businessDates } from "@/lib/monthly";
const OFFSET = 8 * 3600000, DAY = 86400000;
export type ReportRangeInput = { period?: string; month?: string; from?: string; to?: string };
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期格式不正确");
  const result = new Date(value + "T00:00:00+08:00");
  if (!Number.isFinite(result.getTime()) || new Date(result.getTime()+OFFSET).toISOString().slice(0,10) !== value) throw new Error("日期不存在");
  return result;
}
export function reportMonthKey(date: Date) { return new Date(date.getTime()+OFFSET).toISOString().slice(0,7); }
export function reportDateKey(date: Date) { return new Date(date.getTime()+OFFSET).toISOString().slice(0,10); }
export function resolveReportRange(input: ReportRangeInput = {}, now = new Date()) {
  const current = businessDates(now);
  const mode = ["month","1m","3m","6m","custom"].includes(input.period ?? "") ? input.period! : "month";
  let start = current.monthStart, end = current.monthEnd, label = current.monthLabel;
  if (mode === "month") {
    const key = input.month || current.monthKey;
    if (!/^\d{4}-\d{2}$/.test(key)) throw new Error("请选择有效月份");
    start = day(key+"-01");
    end = businessDates(start).monthEnd;
    label = key.replace("-", "年")+"月";
  } else if (mode === "custom") {
    if (!input.from || !input.to) throw new Error("请选择开始和结束日期");
    start = day(input.from); end = new Date(day(input.to).getTime()+DAY);
    if (start >= end) throw new Error("开始日期不能晚于结束日期");
    if (end.getTime()-start.getTime() > 24*31*DAY) throw new Error("单次统计范围不能超过两年");
    label = input.from+" 至 "+input.to;
  } else {
    const count = mode === "6m" ? 6 : mode === "3m" ? 3 : 1;
    const local = new Date(current.monthStart.getTime()+OFFSET);
    start = new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()-count+1,1)-OFFSET);
    label = "最近 "+count+" 个月（含本月）";
  }
  if (start > now) throw new Error("不能统计尚未开始的日期");
  end = new Date(Math.min(end.getTime(),now.getTime()+1));
  return { start,end,label,mode,month: input.month || current.monthKey, from: reportDateKey(start), to: reportDateKey(new Date(end.getTime()-1)), isCurrentMonth: start.getTime() === current.monthStart.getTime() && end > now, historical: end <= now };
}

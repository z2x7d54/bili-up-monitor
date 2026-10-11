import { creatorDisplayName } from "@/lib/creator-personal";
import { prisma } from "@/lib/db";
import { businessDates, overdueThreshold, publicationState } from "@/lib/monthly";
import { resolveReportRange, reportMonthKey, type ReportRangeInput } from "@/lib/report-range";
import { descendantGroupNames, groupHierarchy } from "@/lib/group-tree";
export async function getMonthlyReport(options: ReportRangeInput & { overdueDays?: string | number; now?: Date; group?: string; query?: string; creatorId?: string } = {}) {
  const now = options.now ?? new Date(), dates = businessDates(now);
  const range = resolveReportRange(options,now), threshold = overdueThreshold(options.overdueDays);
  const groups = await prisma.creatorGroup.findMany({ orderBy: [{ sortOrder:"asc" },{ name:"asc" }] });
  const tree = groupHierarchy(groups), paths = new Map(tree.map(g => [g.name,g.path]));
  const scope = options.group && options.group !== "ALL" ? descendantGroupNames(groups,options.group) : null;
  const q = options.query?.trim();
  const creatorWhere = { ...(scope ? { groupName: { in: scope } } : {}), ...(options.creatorId && options.creatorId !== "ALL" ? { id: options.creatorId } : {}),
    ...(q ? { OR: [{ name:{ contains:q } },{ alias:{ contains:q } },{ note:{ contains:q } },{ mid:{ contains:q } }] } : {}) };
  const [creators, monthVideos, lastPublications] = await Promise.all([
    prisma.upCreator.findMany({ where: creatorWhere, orderBy: [{ groupName:"asc" },{ name:"asc" }] }),
    prisma.contentItem.findMany({ where: { creator: creatorWhere, publishedAt:{ gte:range.start,lt:range.end } }, orderBy:[{ publishedAt:"desc" },{ bvid:"asc" }] }),
    prisma.contentItem.groupBy({ by:["creatorId"], _max:{ publishedAt:true }, where:{ creator:creatorWhere, publishedAt:{ lte:now } } }),
  ]);
  const byCreator = new Map<string,typeof monthVideos>();
  for (const video of monthVideos) { const list = byCreator.get(video.creatorId) ?? [];list.push(video);byCreator.set(video.creatorId,list); }
  const lastByCreator = new Map(lastPublications.map(r => [r.creatorId,r._max.publishedAt]));
  const hasCoverage = (c: typeof creators[number], start: Date, end: Date) => !!c.lastVideoSyncAt && !!c.lastVideoSyncFromAt && c.lastVideoSyncFromAt <= start &&
    c.lastVideoSyncAt >= (end <= now ? end : start) && !c.lastError;
  const accounts = creators.map(creator => {
    const videos = byCreator.get(creator.id) ?? [], lastPublishedAt = lastByCreator.get(creator.id) ?? null;
    const complete = hasCoverage(creator,range.start,range.end);
    return { ...creator, biliName:creator.name, name:creatorDisplayName(creator), groupPath:paths.get(creator.groupName) ?? creator.groupName, complete, monthCount:videos.length,
      todayCount:videos.filter(v => v.publishedAt && v.publishedAt >= dates.todayStart).length,
      monthViews:videos.reduce((s,v) => s+v.viewCount,0),monthLikes:videos.reduce((s,v) => s+v.likeCount,0),
      comments:videos.reduce((s,v) => s+v.replyCount,0), coins:videos.reduce((s,v) => s+v.coinCount,0), favorites:videos.reduce((s,v) => s+v.favoriteCount,0),
      danmaku:videos.reduce((s,v) => s+v.danmakuCount,0),shares:videos.reduce((s,v) => s+v.shareCount,0),
      lastPublishedAt,recentVideos:videos.slice(0,6),...publicationState({ complete,monthCount:videos.length,lastPublishedAt,overdueDays:threshold,now }) };
  });
  const periods = [];
  let cursor = businessDates(range.start).monthStart;
  while (cursor < range.end) {
    const month = businessDates(cursor), start = new Date(Math.max(range.start.getTime(),cursor.getTime())), end = new Date(Math.min(range.end.getTime(),month.monthEnd.getTime()));
    const videos = monthVideos.filter(v => v.publishedAt && v.publishedAt >= start && v.publishedAt < end);
    const pending = creators.filter(c => !hasCoverage(c,start,end)).length;
    periods.push({ key:reportMonthKey(cursor),label:month.monthLabel,posts:videos.length,views:videos.reduce((s,v)=>s+v.viewCount,0),
      likes:videos.reduce((s,v)=>s+v.likeCount,0),pending,accountCount:creators.length,recentVideos:videos.slice(0,3),partial:start > cursor || end < month.monthEnd });
    cursor = month.monthEnd;
  }
  return { monthKey:dates.monthKey,monthLabel:dates.monthLabel,monthStart:dates.monthStart,todayStart:dates.todayStart,generatedAt:now,overdueDays:threshold,range,periods,
    totals:{ accountCount:accounts.length,monthCount:monthVideos.length,todayCount:accounts.reduce((s,c)=>s+c.todayCount,0),views:accounts.reduce((s,c)=>s+c.monthViews,0),
      likes:accounts.reduce((s,c)=>s+c.monthLikes,0),noMonthPosts:accounts.filter(c=>c.complete && c.monthCount===0).length,
      overdueCount:accounts.filter(c=>c.state==="OVERDUE").length,pendingCount:accounts.filter(c=>!c.complete).length },accounts,
    videos:monthVideos.map(v => ({ ...v,creatorName:creatorDisplayName(creators.find(c=>c.id===v.creatorId) ?? { name:"" }),mid:creators.find(c=>c.id===v.creatorId)?.mid ?? "",groupPath:paths.get(creators.find(c=>c.id===v.creatorId)?.groupName ?? "") ?? "" })) };
}

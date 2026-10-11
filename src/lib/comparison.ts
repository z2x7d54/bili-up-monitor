import { prisma } from "@/lib/db";
import { goalTargetsSchema,goalStatus,GOAL_METRICS,type GoalTargets } from "@/lib/goal-format";
import { groupHierarchy,descendantGroupNames } from "@/lib/group-tree";
import type { getMonthlyReport } from "@/lib/monthly-report";
import { reportMonthKey } from "@/lib/report-range";
import { businessDates } from "@/lib/monthly";
import type { ComparisonEntity,ComparisonValues } from "@/lib/comparison-format";
import type { ComparisonSelection } from "@/lib/comparison-selection";
export async function getComparisonData(report:Awaited<ReturnType<typeof getMonthlyReport>>,publication="ALL",selection?:ComparisonSelection) {
  let accounts=report.accounts.filter(a=>publication==="ALL" || (publication==="NO_MONTH_POSTS"?a.complete&&a.monthCount===0:a.state===publication));
  const [rows,goalRows,memberships]=await Promise.all([prisma.creatorGroup.findMany(),prisma.goalConfig.findMany({where:{period:"MONTH"}}),prisma.upCreator.findMany({select:{id:true,groupName:true}})]);
  const groups=groupHierarchy(rows),byName=new Map(groups.map(g=>[g.name,g]));
  let selectedGroupIds:Set<string>|undefined;
  if(selection?.type==="GROUP"){
    const candidates=groups.filter(g=>(!selection.groupLevel||g.depth===selection.groupLevel)&&accounts.some(a=>descendantGroupNames(groups,g.name).includes(a.groupName)));
    const eligible=new Set(candidates.map(g=>g.name)),ids=selection.ids??candidates.map(g=>g.name);
    if(!ids.length)throw new Error("请至少选择一个参与对比的分组");
    if(ids.some(id=>!eligible.has(id)))throw new Error("所选分组已变更或不在当前筛选范围，请刷新后重新选择");
    selectedGroupIds=new Set(ids);
    const accountScope=new Set(ids.flatMap(id=>descendantGroupNames(groups,id)));
    accounts=accounts.filter(a=>accountScope.has(a.groupName));
  }else if(selection?.type==="CREATOR"&&selection.ids){
    const eligible=new Set(accounts.map(a=>a.id));
    if(!selection.ids.length)throw new Error("请至少选择一个参与对比的博主");
    if(selection.ids.some(id=>!eligible.has(id)))throw new Error("所选博主已变更或不在当前筛选范围，请刷新后重新选择");
    const ids=new Set(selection.ids);accounts=accounts.filter(a=>ids.has(a.id));
  }
  const levels=(name:string):string[]=>{const g=byName.get(name);return g?.parentName?[...levels(g.parentName),name]:[name];};
  const goalMap=new Map(goalRows.map(g=>[g.creatorId?"C:"+g.creatorId:"G:"+g.groupName,goalTargetsSchema.parse(JSON.parse(g.targets))]));
  function entity(id:string,type:"CREATOR"|"GROUP",name:string,mid:string,groupName:string,groupPath:string,level:number,items:typeof accounts):ComparisonEntity {
    const targets:GoalTargets=report.range.isCurrentMonth ? goalMap.get((type==="CREATOR"?"C:":"G:")+id) ?? {} : {};
    const pending=items.filter(a=>!a.complete).length,complete=items.length>0&&pending===0;
    const scope=new Set(descendantGroupNames(groups,groupName));
    const scopeAccountCount=type==="CREATOR"?1:memberships.filter(c=>scope.has(c.groupName)).length,scopeComplete=items.length===scopeAccountCount;
    const values:ComparisonValues={posts:0,views:0,likes:0,comments:0,coins:0,favorites:0,danmaku:0,shares:0,followers:0,avgViews:null,avgLikes:null,interactionRate:null,goalProgress:null};
    for(const a of items){values.posts+=a.monthCount;values.views+=a.monthViews;values.likes+=a.monthLikes;values.comments+=a.comments;values.coins+=a.coins;values.favorites+=a.favorites;values.danmaku+=a.danmaku;values.shares+=a.shares;values.followers+=a.followerCount;}
    if(complete&&values.posts>0){values.avgViews=Math.round(values.views/values.posts*100)/100;values.avgLikes=Math.round(values.likes/values.posts*100)/100;}
    if(complete&&values.views>0)values.interactionRate=Math.round((values.likes+values.comments+values.coins+values.favorites+values.danmaku+values.shares)/values.views*10000)/100;
    const configured=GOAL_METRICS.filter(k=>targets[k]!==undefined);
    if(complete&&scopeComplete&&configured.length)values.goalProgress=Math.round(configured.reduce((sum,k)=>sum+(targets[k]===0?1:Math.min(1,values[k]/targets[k]!)),0)/configured.length*10000)/100;
    const dates=items.map(a=>a.lastVideoSyncAt?.toISOString()).filter((d):d is string=>!!d).sort();
    return {id,type,name,mid,groupName,groupPath,groupLevels:levels(groupName),level,accountCount:items.length,scopeAccountCount,scopeComplete,complete,pending,values,targets,
      goalState:!report.range.isCurrentMonth?"仅本月评估目标":!scopeComplete?"筛选未覆盖整个分组，不评估目标":goalStatus(targets,values,complete).status,collectedAt:dates[0]??null};
  }
  const creators=accounts.map(a=>({...entity(a.id,"CREATOR",a.name,a.mid,a.groupName,a.groupPath,byName.get(a.groupName)?.depth??1,[a]),biliName:a.biliName,note:a.note}));
  const grouped=selection?.type==="CREATOR"?[]:groups.filter(g=>!selectedGroupIds||selectedGroupIds.has(g.name)).map(g=>{const scope=new Set(descendantGroupNames(groups,g.name));return entity(g.name,"GROUP",g.name,"",g.name,g.path,g.depth,accounts.filter(a=>scope.has(a.groupName)));}).filter(g=>g.accountCount>0);
  const ids=new Set(accounts.map(a=>a.id)),videos=report.videos.filter(v=>ids.has(v.creatorId));
  const periods=report.periods.map(period=>{
    const list=videos.filter(v=>v.publishedAt&&reportMonthKey(v.publishedAt)===period.key);
    const monthStart=new Date(period.key+"-01T00:00:00+08:00");
    const start=new Date(Math.max(report.range.start.getTime(),monthStart.getTime())),end=new Date(Math.min(report.range.end.getTime(),businessDates(monthStart).monthEnd.getTime()));
    const pending=accounts.filter(c=>!c.lastVideoSyncAt||!c.lastVideoSyncFromAt||c.lastVideoSyncFromAt>start||c.lastVideoSyncAt<(end<=report.generatedAt?end:start)||!!c.lastError).length;
    return {...period,posts:list.length,views:list.reduce((s,v)=>s+v.viewCount,0),likes:list.reduce((s,v)=>s+v.likeCount,0),pending,accountCount:accounts.length,recentVideos:list.slice(0,3)};
  });
  return {creators,groups:grouped,accounts,videos,periods};
}

import type { GoalTargets } from "@/lib/goal-format";
export type ComparisonValues = { posts:number;views:number;likes:number;comments:number;coins:number;favorites:number;danmaku:number;shares:number;followers:number;avgViews:number|null;avgLikes:number|null;interactionRate:number|null;goalProgress:number|null };
export type ComparisonEntity = { id:string;type:"CREATOR"|"GROUP";name:string;biliName?:string;note?:string|null;mid:string;groupName:string;groupPath:string;groupLevels:string[];level:number;accountCount:number;scopeAccountCount:number;scopeComplete:boolean;complete:boolean;pending:number;values:ComparisonValues;targets:GoalTargets;goalState:string;collectedAt:string|null };
export type ComparisonMetric = keyof ComparisonValues;
export const COMPARISON_METRICS: { key:ComparisonMetric;label:string;kind:"number"|"percent";needsComplete:boolean }[] = [
  {key:"posts",label:"投稿数",kind:"number",needsComplete:true},{key:"views",label:"播放量",kind:"number",needsComplete:true},
  {key:"likes",label:"点赞",kind:"number",needsComplete:true},{key:"comments",label:"评论",kind:"number",needsComplete:true},
  {key:"coins",label:"投币",kind:"number",needsComplete:true},{key:"favorites",label:"收藏",kind:"number",needsComplete:true},
  {key:"danmaku",label:"弹幕",kind:"number",needsComplete:true},{key:"shares",label:"分享",kind:"number",needsComplete:true},
  {key:"followers",label:"当前粉丝",kind:"number",needsComplete:false},{key:"avgViews",label:"单条平均播放",kind:"number",needsComplete:true},
  {key:"avgLikes",label:"单条平均点赞",kind:"number",needsComplete:true},{key:"interactionRate",label:"互动率",kind:"percent",needsComplete:true},
  {key:"goalProgress",label:"月目标平均完成度",kind:"percent",needsComplete:true}
];
export function parseComparisonMetric(value?:string):ComparisonMetric { return COMPARISON_METRICS.find(m=>m.key===value)?.key ?? "views"; }
export function sortComparison(entities:ComparisonEntity[],key:ComparisonMetric) {
  const metric=COMPARISON_METRICS.find(m=>m.key===key)!;
  const valid=(e:ComparisonEntity)=>e.scopeComplete && e.values[key]!==null && (!metric.needsComplete || e.complete);
  return [...entities].sort((a,b)=>Number(valid(b))-Number(valid(a)) || (valid(a)&&valid(b)?(b.values[key]??0)-(a.values[key]??0):0) || a.groupPath.localeCompare(b.groupPath,"zh-CN") || a.name.localeCompare(b.name,"zh-CN"));
}
export function comparisonRanks(entities:ComparisonEntity[],key:ComparisonMetric) {
  const metric=COMPARISON_METRICS.find(m=>m.key===key)!,ranks=new Map<string,number>();let previous:number|null=null,rank=0,index=0;
  for(const e of sortComparison(entities,key)){
    const value=e.values[key];if(!e.scopeComplete || value===null || (metric.needsComplete && !e.complete))continue;
    index++;if(value!==previous)rank=index;ranks.set(e.id,rank);previous=value;
  }
  return ranks;
}
export function comparePair(a:ComparisonEntity,b:ComparisonEntity,key:ComparisonMetric) {
  const metric=COMPARISON_METRICS.find(m=>m.key===key)!;
  const av=a.values[key],bv=b.values[key];
  if(!a.scopeComplete||!b.scopeComplete)return {difference:null,change:null,note:"筛选未包含整个分组，暂不判断高低"};
  if(metric.needsComplete && (!a.complete||!b.complete))return { difference:null,change:null,note:"数据待补齐，暂不判断高低" };
  if(av===null||bv===null)return {difference:null,change:null,note:key==="goalProgress"?"未设置可比较的月目标":"暂无可比较数据"};
  const difference=Math.round((av-bv)*10000)/10000;
  return { difference,change:metric.kind==="percent" || bv===0 ? null : Math.round(difference/bv*10000)/100,
    note:difference===0?"相同":difference>0?"A 数值更高":"B 数值更高" };
}

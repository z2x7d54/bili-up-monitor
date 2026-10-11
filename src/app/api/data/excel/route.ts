import { getMonthlyReport } from "@/lib/monthly-report";
import { getComparisonData } from "@/lib/comparison";
import { parseComparisonIds,type ComparisonSelection } from "@/lib/comparison-selection";
import { COMPARISON_METRICS,parseComparisonMetric,sortComparison,comparisonRanks,comparePair,type ComparisonEntity } from "@/lib/comparison-format";
import { GOAL_METRICS,GOAL_LABELS } from "@/lib/goal-format";
import { reportMonthKey } from "@/lib/report-range";
import { createExcel } from "@/lib/excel";
import { jsonError } from "@/lib/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const date=(value:Date|string|null)=>value?new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"";
type Cell=string|number|null|undefined;
type Sheet={name:string;rows:Cell[][];widths?:number[]};
export async function GET(request:Request) {
  try {
    const p=new URL(request.url).searchParams;
    const report=await getMonthlyReport({period:p.get("period")??undefined,month:p.get("month")??undefined,from:p.get("from")??undefined,to:p.get("to")??undefined,group:p.get("group")??undefined,query:p.get("accountQuery")??p.get("q")??undefined,creatorId:p.get("creatorId")??undefined,overdueDays:p.get("overdueDays")??undefined});
    const compareType=p.get("compareType");
    if(compareType!==null&&compareType!=="GROUP"&&compareType!=="CREATOR")throw new Error("对比类型不正确");
    const explicitScope=p.get("comparisonScope");
    if(explicitScope!==null&&explicitScope!=="ALL"&&explicitScope!=="SELECTED")throw new Error("对比范围不正确");
    if(!compareType&&(explicitScope!==null||p.has("comparisonIds")))throw new Error("请选择对比类型");
    const comparisonScope=explicitScope??(p.has("compareA")||p.has("compareB")?"SELECTED":"ALL");
    const ids=parseComparisonIds(p.get("comparisonIds"))??[p.get("compareA"),p.get("compareB")].filter((id):id is string=>!!id);
    const level=p.get("groupLevel")??"1";
    if(compareType==="GROUP"&&!["1","2","3","4"].includes(level))throw new Error("比较层级不正确");
    const selection:ComparisonSelection|undefined=compareType?{type:compareType,ids:comparisonScope==="SELECTED"?ids:undefined,groupLevel:compareType==="GROUP"?Number(level):undefined}:undefined;
    const {creators,groups,accounts,videos,periods}=await getComparisonData(report,p.get("publication")??"ALL",selection);
    let rankBy=parseComparisonMetric(p.get("rankBy")??undefined);
    if(rankBy==="goalProgress"&&!report.range.isCurrentMonth)rankBy="views";
    const rankLabel=COMPARISON_METRICS.find(m=>m.key===rankBy)!.label;
    const metrics=COMPARISON_METRICS.filter(m=>m.key!=="goalProgress"||report.range.isCurrentMonth);
    const metricHeaders=metrics.map(m=>(m.key==="posts"?(report.range.isCurrentMonth?"本月投稿数":"期间投稿数"):m.label)+(m.kind==="percent"?"（%）":""));
    const levels=(e:ComparisonEntity)=>[0,1,2,3].map(i=>e.groupLevels[i]??"");
    const values=(e:ComparisonEntity)=>metrics.map(m=>e.values[m.key]);
    const collection=(e:ComparisonEntity)=>e.complete?"已完整采集":"待补齐：仅已采集部分";
    const creatorRanks=comparisonRanks(creators,rankBy);
    const creatorRows=sortComparison(creators,rankBy).map(e=>[
      creatorRanks.get(e.id)??null,e.name,e.mid,...levels(e),e.groupPath,...values(e),
      e.goalState,collection(e),date(e.collectedAt),e.biliName??e.name,e.note??"",
    ]);
    const groupRows:Cell[][]=[];
    for(const level of [1,2,3,4]){
      const entities=groups.filter(g=>g.level===level),ranks=comparisonRanks(entities,rankBy);
      for(const e of sortComparison(entities,rankBy))groupRows.push([
        level,ranks.get(e.id)??null,e.name,...levels(e),e.groupPath,e.accountCount,e.scopeAccountCount,
        ...values(e),e.goalState,e.scopeComplete?"完整分组":"仅当前筛选账号",e.pending,collection(e),date(e.collectedAt),
      ]);
    }
    const sheets:Sheet[]=[
      {name:"博主对比",rows:[["排名（"+rankLabel+"）","博主","UID","一级分组","二级分组","三级分组","四级分组","所属分组路径",...metricHeaders,"月目标状态","采集完整性","最近采集","B站昵称","备注"],...creatorRows],widths:[20,26,24,22,22,22,22,55,...metrics.map(()=>22),35,30,24,26,60]},
      {name:"分组对比",rows:[["分组层级","同级排名（"+rankLabel+"）","分组","一级分组","二级分组","三级分组","四级分组","分组路径","参与账号数","完整分组账号数",...metricHeaders,"月目标状态","账号范围","待补齐账号数","采集完整性","最早最近采集"],...groupRows],widths:[12,24,26,22,22,22,22,55,18,20,...metrics.map(()=>22),40,25,18,30,24]},
    ];
    if(compareType==="GROUP")sheets.reverse();
    if(compareType==="CREATOR")sheets.splice(1,1);
    const pairType=compareType==="GROUP"?"GROUP":"CREATOR";
    const candidates=pairType==="GROUP"?groups:creators;
    const a=candidates.find(e=>e.id===p.get("compareA")),b=candidates.find(e=>e.id===p.get("compareB"));
    if(a&&b&&a.id!==b.id&&(pairType!=="GROUP"||a.level===b.level)){
      const rows:Cell[][]=[
        ["指标／说明","A："+a.name,"B："+b.name,"差值（A − B）","相对 B（%）","说明"],
        ["对比类型",pairType==="GROUP"?"分组":"博主",pairType==="GROUP"?"分组":"博主"],
        ["统计期间",report.range.from+" 至 "+report.range.to,report.range.from+" 至 "+report.range.to],
        ["所属分组路径",a.groupPath,b.groupPath],["UID",a.mid,b.mid],
        ["参与账号数",a.accountCount,b.accountCount],["采集完整性",collection(a),collection(b)],
        ...metrics.map(m=>{const r=comparePair(a,b,m.key);return [m.label+(m.kind==="percent"?"（%）":""),a.values[m.key],b.values[m.key],r.difference,r.change,r.note+(r.difference!==null&&m.kind==="percent"?"；差值单位为百分点":r.difference!==null&&b.values[m.key]===0?"；B 为 0，不计算相对比例":"")];}),
      ];
      sheets.push({name:"A-B对比",rows,widths:[30,45,45,22,22,65]});
    }
    if(report.range.isCurrentMonth){
      const rows:Cell[][]=[["类型","博主／分组","UID","分组路径","目标指标","月目标值","本月实际值","完成率（%）","是否达标","说明"]];
      for(const e of [...creators,...groups])for(const key of GOAL_METRICS)if(e.targets[key]!==undefined){
        const target=e.targets[key]!,actual=e.values[key],eligible=e.complete&&e.scopeComplete;
        rows.push([e.type==="GROUP"?"分组":"博主",e.name,e.mid,e.groupPath,GOAL_LABELS[key],target,actual,eligible?(target===0?100:Math.round(Math.min(1,actual/target)*10000)/100):null,eligible?(actual>=target?"达标":"未达标"):"暂不判断",e.goalState]);
      }
      sheets.push({name:"月目标完成情况",rows,widths:[12,26,24,55,20,20,20,22,20,40]});
    }
    const videoKeys=["viewCount","likeCount","replyCount","coinCount","favoriteCount","danmakuCount","shareCount"] as const;
    const monthRows=periods.map(period=>{
      const list=videos.filter(v=>v.publishedAt&&reportMonthKey(v.publishedAt)===period.key);
      const pending=period.pending;
      return [period.label,accounts.length,list.length,...videoKeys.map(key=>list.reduce((sum,v)=>sum+v[key],0)),pending,pending?"待补齐：仅已采集部分":"已完整采集",period.partial?"部分月份":"完整月份"];
    });
    sheets.push(
      {name:"月份对比",rows:[["月份","参与账号数","投稿数","播放量","点赞","评论","投币","收藏","弹幕","分享","待补齐账号数","采集完整性","日期覆盖",],...monthRows],widths:[24,18,18,22,22,22,22,22,22,22,20,30,20]},
      {name:"视频明细",rows:[["标题","BV号","博主","UID","所属分组路径","发布时间","播放量","点赞","评论","投币","收藏","弹幕","分享","视频链接","封面链接","最近采集"],...videos.map(v=>[v.title,v.bvid,v.creatorName,v.mid,v.groupPath,date(v.publishedAt),...videoKeys.map(key=>v[key]),"https://www.bilibili.com/video/"+v.bvid,v.coverUrl,date(v.lastFetchedAt)])],widths:[65,24,26,24,55,24,22,22,22,22,22,22,22,60,70,24]},
      {name:"统计说明",rows:[
        ["统计项","数值／说明"],["统计期间",report.range.label],["开始时间",date(report.range.start)],["结束时间",date(new Date(report.range.end.getTime()-1))],["账号筛选",p.get("accountQuery")??p.get("q")??"全部"],["上方分组筛选",p.get("group")??"全部"],["对比类型",compareType==="GROUP"?"分组":compareType==="CREATOR"?"博主":"综合统计"],["对比范围",compareType?(comparisonScope==="ALL"?(compareType==="GROUP"?"全部同级分组":"全部博主"):"自选"+(compareType==="GROUP"?"分组":"博主")):"上方筛选范围"],["实际参与对比",compareType==="GROUP"?groups.map(g=>g.groupPath).join("；"):creators.map(c=>c.name+"（"+c.mid+"）").join("；")],["投稿状态筛选",p.get("publication")??"ALL"],
        ["参与账号数",accounts.length],["待补齐账号数",accounts.filter(a=>!a.complete).length],["排行指标",rankLabel+"；高到低，同值并列；未覆盖整个分组的行不参与排名"],
        ["视频统计口径","按所选期间发布的视频统计。播放和互动为最近采集时的累计值，并非期间新增流量。"],
        ["分组统计口径","分组对比仅导出当前参与的分组及其下级账号、视频和月目标；分组统计行只包含所选组。博主对比仅导出当前参与的博主。父级名称作为路径信息保留。当前筛选可能只包含组内部分账号，详见参与账号数与完整分组账号数。"],["排行范围","按实际导出的对象重新排行，分组按同一层级比较，同值并列。待补齐数据或未覆盖整个分组时不参与对应排名。"],
        ["单条平均播放／点赞","总播放／总点赞除以投稿数。完整采集且投稿数大于 0 才计算；不适用时留空。"],
        ["互动率（%）","（点赞＋评论＋投币＋收藏＋弹幕＋分享）÷播放量×100。互动次数不去重，不能视作互动人数占比。播放为 0 或数据待补齐时留空。"],
        ["A-B差值","A 减 B；相对 B＝（A−B）÷B×100%。B 为 0 不计算比例；百分比指标差值单位为百分点。待补齐数据不判断高低。"],
        ["月目标","仅本月评估，沿用手动设置的目标值。筛选未覆盖整个分组时，不评估该分组目标。"],
        ["月目标平均完成度","已设置目标指标的完成率平均；单项最高计 100%，明确设置为 0 的指标计 100%。未设置目标或不适用时留空。"],
        ["数据完整性","待补齐行仅包含已采集数据，不参与投稿／播放等指标排名，也不能据此判定零投稿。当前粉丝是最近账号采集的快照，仍可单独比较。"],
        ["导出格式","UID、BV 号、分组名按文本保存；统计数值为数字，支持排序、筛选、求和与透视表。"],
        ["导出时间",date(new Date())],
      ],widths:[32,115]},
    );
    const bytes=createExcel(sheets);
    const name="博主分组对比-"+report.range.from+"-"+report.range.to+".xlsx";
    return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(name),"Cache-Control":"no-store"}});
  }catch(e){return jsonError(e);}
}

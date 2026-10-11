export type ComparisonSelection = { type:"CREATOR"|"GROUP";ids?:string[];groupLevel?:number };
export function parseComparisonIds(value?:string|null):string[]|undefined {
  if(value===undefined||value===null)return undefined;
  try {
    const parsed:unknown=JSON.parse(value);
    if(!Array.isArray(parsed)||parsed.length>500||parsed.some(v=>typeof v!=="string"||!v.length||v.length>500))throw new Error();
    return [...new Set(parsed as string[])];
  }catch{throw new Error("对比选择参数不正确，请重新选择要对比的博主或分组");}
}

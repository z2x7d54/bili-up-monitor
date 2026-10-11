"use client";
import { useState } from "react";
import { Download,LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ExcelExportButton({ params,label="导出对比 Excel",disabled=false }: { params:Record<string,string|undefined>;label?:string;disabled?:boolean }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function download() {
    setBusy(true);setError("");
    try {
      const query=new URLSearchParams();for(const [key,value] of Object.entries(params))if(value)query.set(key,value);
      const response=await fetch("/api/data/excel?"+query,{cache:"no-store"});
      if(!response.ok){const body=await response.json();throw new Error(body.error||"导出失败");}
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
      const match=response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/);
      link.href=url;link.download=match?decodeURIComponent(match[1]):"博主分组对比.xlsx";
      document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(e instanceof Error?e.message:"导出失败");}finally{setBusy(false);}
  }
  return <div><Button variant="outline" disabled={busy||disabled} onClick={()=>void download()}>{busy?<LoaderCircle className="size-4 animate-spin"/>:<Download className="size-4"/>}{busy?"正在导出…":label}</Button>{error&&<p role="alert" className="mt-1 text-xs text-rose-600">{error}</p>}</div>;
}

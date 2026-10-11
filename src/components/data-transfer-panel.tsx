"use client";

import { useRef, useState } from "react";
import { Download, Upload, Database, CheckCircle2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DATA_FILE_LIMIT, parseDataFile, summarizeData, type DataSummary } from "@/lib/data-transfer-format";

export function DataTransferPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [busy, setBusy] = useState<"download" | "upload" | "preview" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [replacePersonal, setReplacePersonal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  async function select(next: File | undefined) {
    const token = ++selection.current;
    setFile(null); setSummary(null); setError(""); setMessage("");
    if (!next) return;
    setBusy("preview");
    try {
      if (next.size > DATA_FILE_LIMIT) throw new Error("文件超过 100 MB，无法上传。");
      let value: unknown;
      try { value = JSON.parse(await next.text()); } catch { throw new Error("文件不是有效的 JSON，请选择下载的数据文件。"); }
      const parsed = parseDataFile(value);
      if (selection.current === token) { setFile(next); setSummary(summarizeData(parsed)); }
    } catch (failure) { if (selection.current === token) setError(failure instanceof Error ? failure.message : "文件读取失败"); }
    finally { if (selection.current === token) setBusy(null); }
  }
  async function download() {
    setBusy("download"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/data-transfer", { cache: "no-store" });
      if (!response.ok) { const payload = await response.json(); throw new Error(payload.error || "下载失败"); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "YourBili-data.json";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("数据文件已下载。把这个 JSON 文件带到另一台电脑，在设置页上传即可。");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "下载失败"); }
    finally { setBusy(null); }
  }
  async function upload() {
    if (!file || !summary) return;
    setBusy("upload"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/data-transfer", { method: "POST", headers: { "Content-Type": "application/json", "X-YourBili-Personal-Data": replacePersonal ? "file" : "local" }, body: file });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "上传失败");
      setMessage(`上传完成：新增 ${payload.data.addedAccounts} 个账号，更新 ${payload.data.updatedAccounts} 个账号，导入 ${payload.data.groups} 个分组、${payload.data.videos} 条视频、${payload.data.notifications} 份历史通知。${payload.data.preservedPersonalAccounts ? "已保留 " + payload.data.preservedPersonalAccounts + " 个账号原有的本地显示名或备注。" : ""}`);
      setFile(null); setSummary(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (failure) { setError(failure instanceof Error ? failure.message : "上传失败"); }
    finally { setBusy(null); }
  }
  return <section className="rounded-lg border border-black/[0.055] bg-white p-6 shadow-none" aria-label="跨电脑数据互通">
    <div className="flex items-center gap-2"><Database className="size-5 text-[var(--app-primary)]" /><h2 className="text-lg font-semibold">跨电脑数据互通</h2></div>
    <p className="mt-2 text-sm text-slate-500">A 电脑下载数据 → 将文件带到 B 电脑 → 在此上传，账号、分组、备注 / 待办、目标和通知一起迁移。</p>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <div className="rounded-xl bg-slate-50 p-4"><h3 className="font-medium">下载数据</h3><p className="mt-2 text-xs leading-6 text-slate-500">包含所有监控账号、分组归属、本地显示名和备注、视频数据、趋势快照、监控任务、采集记录、月度目标和完整月报历史通知。</p><Button className="mt-4 gap-2" onClick={() => void download()} disabled={!!busy}>{busy === "download" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{busy === "download" ? "正在下载…" : "下载数据"}</Button></div>
      <div className="rounded-xl bg-slate-50 p-4"><h3 className="font-medium">上传数据</h3><Label htmlFor="dataFile" className="mt-3 mb-2 block text-xs text-slate-500">选择另一台电脑下载的 JSON 数据文件（最大 100 MB）</Label><Input ref={inputRef} id="dataFile" type="file" accept=".json,application/json" disabled={!!busy} onChange={event => void select(event.target.files?.[0])} className="bg-white" />
        {summary && <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><span><b>{summary.accounts}</b> 个账号</span><span><b>{summary.groups}</b> 个分组</span><span><b>{summary.videos}</b> 条视频</span><span><b>{summary.notifications}</b> 份通知</span><span><b>{summary.goals}</b> 个目标</span></div><p className="text-xs text-slate-400">导出于 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(summary.exportedAt))}</p></div>}
        {summary && <div className="mt-3 space-y-1"><label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[var(--app-primary)]" checked={replacePersonal} disabled={!!busy} onChange={event => setReplacePersonal(event.target.checked)} /><span>用文件中的显示名和备注更新本机同账号</span></label><p className="pl-5 text-xs leading-5 text-slate-500">{replacePersonal ? "以文件中的内容为准，包括已清空的备注；旧文件没有备注字段时，仍保留本机备注。" : "本机已有内容会保留，空白处自动补入。若要同步另一台电脑修改过的备注，请勾选此项。"}</p></div>}
        <Button variant="outline" className="mt-4 gap-2" disabled={!!busy || !summary} onClick={() => void upload()}>{busy === "upload" || busy === "preview" ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}{busy === "upload" ? "正在合并数据…" : busy === "preview" ? "正在检查文件…" : "上传数据并合并"}</Button>
      </div>
    </div>
    <p className="mt-4 text-xs leading-6 text-slate-500">按 UID 合并账号，保留本机其他账号；相同账号的分组和采集数据以文件为准；已有本地显示名和备注默认保留，本机为空时从文件补入；勾选上传选项可用文件更新本机备注。目标配置以文件为准；通知按月份去重，同一期内容以文件为准，保留已经读过和弹过的状态。重复上传不会重复添加。导入前自动保存本机数据副本。</p>
    <p className="text-xs leading-6 text-slate-400">Cookie 和本机设置保留在各自电脑上，不随文件迁移。这是手动下载、上传数据；两台电脑同时使用后，可再次传递最新文件。</p>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    {message && <div role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><div>{message}<p className="mt-1 text-xs">可打开看板、博主监控库或通知中心查看数据。</p></div></div>}
  </section>;
}

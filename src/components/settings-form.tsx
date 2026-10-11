"use client";

import type { AppSetting } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function SettingsForm({ settings }: { settings: AppSetting }) {
  const router = useRouter();
  const [schedulerEnabled, setSchedulerEnabled] = useState(settings.schedulerEnabled);
  const [theme, setTheme] = useState(settings.theme === "BLUE" ? "BLUE" : "PINK");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isThemePending, startThemeTransition] = useTransition();

  function updateTheme(nextTheme: "PINK" | "BLUE") {
    if (nextTheme === theme || isThemePending) return;

    setTheme(nextTheme);
    setMessage(null);
    document.documentElement.classList.toggle("theme-blue", nextTheme === "BLUE");

    startThemeTransition(async () => {
      try {
        const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: nextTheme }) });
        const payload = await response.json() as { ok: boolean; error?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.error || "主题切换失败");
        router.refresh();
      } catch (error) {
        setTheme(theme);
        document.documentElement.classList.toggle("theme-blue", theme === "BLUE");
        setMessage(error instanceof Error ? error.message : "网络连接失败，请重试");
      }
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schedulerEnabled,
          defaultIntervalMinutes: formData.get("defaultIntervalMinutes"),
          maxVideosPerUp: formData.get("maxVideosPerUp"),
          requestDelayMinMs: formData.get("requestDelayMinMs"),
          requestDelayMaxMs: formData.get("requestDelayMaxMs"),
          biliCookie: formData.get("biliCookie"),
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "保存失败");
        return;
      }
      setMessage("设置已保存");
      router.refresh();
    });
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <div className="flex items-center justify-between rounded-md px-4 py-3 ring-1 ring-black/[0.045]">
        <div>
          <Label htmlFor="schedulerEnabled" className="text-sm font-medium">
            启用本地调度器
          </Label>
          <p className="mt-1 text-sm text-slate-500">浏览器打开本应用后，本地服务会每 30 秒检查到期任务。</p>
        </div>
        <Switch id="schedulerEnabled" checked={schedulerEnabled} onCheckedChange={setSchedulerEnabled} />
      </div>
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium">主题颜色</Label>
          <p className="mt-1 text-sm text-slate-500">点击后立即切换系统主色。</p>
        </div>
        <div className="inline-flex rounded-md border border-black/[0.055] p-1">
          <button
            type="button"
            onClick={() => updateTheme("PINK")}
            disabled={isThemePending}
            className={[
              "flex h-8 cursor-pointer items-center gap-2 rounded px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
              theme === "PINK" ? "bg-slate-100 text-slate-950" : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            <span className="size-2.5 rounded-full bg-[#ff0b72]" />
            粉色
          </button>
          <button
            type="button"
            onClick={() => updateTheme("BLUE")}
            disabled={isThemePending}
            className={[
              "flex h-8 cursor-pointer items-center gap-2 rounded px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
              theme === "BLUE" ? "bg-slate-100 text-slate-950" : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            <span className="size-2.5 rounded-full bg-[#00a1d6]" />
            蓝色
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="defaultIntervalMinutes">默认任务间隔（分钟）</Label>
          <Input id="defaultIntervalMinutes" name="defaultIntervalMinutes" type="number" min={1} max={1440} defaultValue={settings.defaultIntervalMinutes} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxVideosPerUp">近期视频保底采集数</Label>
          <Input id="maxVideosPerUp" name="maxVideosPerUp" type="number" min={1} max={50} defaultValue={settings.maxVideosPerUp} />
          <p className="text-xs text-slate-500">本月视频全部采集；此项用于额外保留近期历史视频。</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="requestDelayMinMs">请求间隔最小值（毫秒）</Label>
          <Input id="requestDelayMinMs" name="requestDelayMinMs" type="number" min={0} max={60000} defaultValue={settings.requestDelayMinMs} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="requestDelayMaxMs">请求间隔最大值（毫秒）</Label>
          <Input id="requestDelayMaxMs" name="requestDelayMaxMs" type="number" min={0} max={60000} defaultValue={settings.requestDelayMaxMs} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="biliCookie">B 站 Cookie（可选，用于稳定抓取投稿列表）</Label>
        <Textarea
          id="biliCookie"
          name="biliCookie"
          defaultValue={settings.biliCookie ?? ""}
          placeholder="从已登录 B 站的浏览器请求中复制 Cookie；留空则使用匿名 buvid，会更容易触发风控。"
          className="min-h-28 font-mono text-xs"
        />
        <p className="text-xs text-slate-500">
          Cookie 只保存在本机 SQLite 数据库中。建议至少包含 SESSDATA、bili_jct、DedeUserID、buvid3、buvid4。
        </p>
      </div>
      {message ? <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
      <Button type="submit" disabled={isPending} className="bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)]">
        {isPending ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

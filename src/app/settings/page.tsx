import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTransferPanel } from "@/components/data-transfer-panel";
import { SettingsForm } from "@/components/settings-form";
import { ensureSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await ensureSettings();

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-black/[0.055] bg-white p-6 shadow-none">
        <h1 className="text-2xl font-semibold">设置</h1>
        <p className="mt-1 text-sm text-slate-500">配置本地调度器和低频抓取参数</p>
      </section>

      <section className="rounded-lg border border-black/[0.055] bg-white p-6 shadow-none">
        <SettingsForm settings={settings} />
      </section>

      <DataTransferPanel />

      <Alert className="border-amber-200 bg-amber-50 text-amber-950">
        <AlertTitle>抓取策略</AlertTitle>
        <AlertDescription>
          当前版本优先使用你手动配置的 B 站 Cookie；未配置时使用匿名 buvid。风控、限流、权限不足或接口变更会记录为失败并退避重试，不会使用代理或验证码绕过。
        </AlertDescription>
      </Alert>
    </div>
  );
}

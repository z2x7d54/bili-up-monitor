"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskControlCookieDialog } from "@/components/risk-control-cookie-dialog";
import { getRiskControlMessage, isRiskControlMessage } from "@/lib/risk-control";

type TaskActionResponse = {
  ok: boolean;
  error?: string;
  data?: {
    details?: Array<{
      message?: string;
    }>;
  };
};

export function TaskActions({ id, status, isRunning }: { id: string; status: string; isRunning: boolean }) {
  const router = useRouter();
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskMessage, setRiskMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function mutate(path: string, init: RequestInit) {
    setError(null);
    const response = await fetch(path, init);
    const payload = (await response.json()) as TaskActionResponse;
    if (!response.ok || !payload.ok) {
      const message = payload.error || "操作失败";
      if (isRiskControlMessage(message)) {
        setRiskMessage(message);
        setRiskDialogOpen(true);
      } else {
        setError(message);
      }
      return;
    }
    const riskDetail = getRiskControlMessage(payload.data?.details?.map((detail) => detail.message) ?? []);
    if (riskDetail) {
      setRiskMessage(riskDetail);
      setRiskDialogOpen(true);
    }
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {error ? <span className="max-w-44 truncate text-xs text-rose-600">{error}</span> : null}
        <Button
          variant="ghost"
          size="icon"
          title="立即执行"
          disabled={isPending || isRunning}
          onClick={() => startTransition(() => mutate(`/api/tasks/${id}/run`, { method: "POST" }))}
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={status === "PAUSED" ? "启用" : "暂停"}
          disabled={isPending}
          onClick={() =>
            startTransition(() =>
              mutate(`/api/tasks/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: status === "PAUSED" ? "ACTIVE" : "PAUSED" }),
              }),
            )
          }
        >
          {status === "PAUSED" ? <Play className="size-4" /> : <Pause className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="删除"
          disabled={isPending || isRunning}
          onClick={() => startTransition(() => mutate(`/api/tasks/${id}`, { method: "DELETE" }))}
        >
          <Trash2 className="size-4 text-rose-600" />
        </Button>
      </div>
      <RiskControlCookieDialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen} message={riskMessage} />
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupComboboxInput } from "@/components/group-combobox-input";
import { RiskControlCookieDialog } from "@/components/risk-control-cookie-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRiskControlMessage } from "@/lib/risk-control";

type CreateUpResponse = {
  ok: boolean;
  error?: string;
  data?: {
    initialSync?: {
      ok: boolean;
      error?: string;
    };
  };
};

export function UpCreateForm({ groups = [] }: { groups?: Array<string | { name: string; path?: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskMessage, setRiskMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const response = await fetch("/api/ups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          upInput: formData.get("upInput"),
          groupName: formData.get("groupName") || "未分组",
        }),
      });
      const payload = (await response.json()) as CreateUpResponse;
      if (!response.ok || !payload.ok) {
        const message = payload.error || "添加 UP 主失败";
        if (isRiskControlMessage(message)) {
          setRiskMessage(message);
          setRiskDialogOpen(true);
        } else {
          setError(message);
        }
        return;
      }
      const initialSyncError = payload.data?.initialSync?.ok === false ? payload.data.initialSync.error : null;
      setOpen(false);
      router.refresh();
      if (isRiskControlMessage(initialSyncError)) {
        setRiskMessage(initialSyncError ?? null);
        setRiskDialogOpen(true);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="h-9 cursor-pointer rounded-md bg-[var(--app-primary)] px-4 text-sm font-medium shadow-none hover:bg-[var(--app-primary-hover)]">
            <Plus className="size-4" />
            添加 UP 主
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加监控 UP 主</DialogTitle>
            <DialogDescription>输入数字 UID 或 space.bilibili.com 主页链接。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="upInput">UID / 主页链接</Label>
              <Input id="upInput" name="upInput" placeholder="例如 546195 或 https://space.bilibili.com/546195" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="groupName">分组</Label>
              <GroupComboboxInput id="groupName" name="groupName" groups={groups} />
            </div>
            {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
            <Button type="submit" disabled={isPending} className="w-full bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)]">
              {isPending ? "抓取中..." : "抓取资料并入库"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <RiskControlCookieDialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen} message={riskMessage} />
    </>
  );
}

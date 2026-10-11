"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CreatorOption = {
  id: string;
  name: string;
  mid: string;
  groupName: string;
};

export function TaskCreateForm({
  creators,
  groups,
  defaultInterval,
}: {
  creators: CreatorOption[];
  groups: string[];
  defaultInterval: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetMode, setTargetMode] = useState("ALL_ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const firstGroup = useMemo(() => groups[0] || "未分组", [groups]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const creatorIds = formData.getAll("creatorIds").map(String);

    startTransition(async () => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          intervalMinutes: formData.get("intervalMinutes"),
          targetMode,
          groupName: formData.get("groupName"),
          creatorIds,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error || "创建任务失败");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)]">
          <Plus className="size-4" />
          新建任务
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新建监控任务</DialogTitle>
          <DialogDescription>本地服务运行时按间隔低频抓取公开数据。</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">任务名称</Label>
              <Input id="name" name="name" placeholder="每日 UP 数据监控" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intervalMinutes">间隔分钟</Label>
              <Input id="intervalMinutes" name="intervalMinutes" type="number" min={1} max={1440} defaultValue={defaultInterval} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>监控范围</Label>
            <Select value={targetMode} onValueChange={setTargetMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_ACTIVE">全部 UP 主</SelectItem>
                <SelectItem value="GROUP">指定分组</SelectItem>
                <SelectItem value="SELECTED">指定 UP 列表</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {targetMode === "GROUP" ? (
            <div className="space-y-2">
              <Label>分组</Label>
              <Select name="groupName" defaultValue={firstGroup}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {targetMode === "SELECTED" ? (
            <div className="max-h-52 space-y-2 overflow-auto rounded-md p-3 ring-1 ring-black/[0.045]">
              {creators.length === 0 ? (
                <div className="text-sm text-slate-500">还没有可选 UP 主</div>
              ) : (
                creators.map((creator) => (
                  <label key={creator.id} className="flex items-center gap-3 text-sm">
                    <input name="creatorIds" value={creator.id} type="checkbox" className="size-4 accent-[var(--app-primary)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {creator.name} <span className="text-slate-400">UID {creator.mid}</span>
                    </span>
                    <span className="text-xs text-slate-500">{creator.groupName}</span>
                  </label>
                ))
              )}
            </div>
          ) : null}
          {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          <Button type="submit" disabled={isPending} className="w-full bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)]">
            {isPending ? "创建中..." : "创建任务"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

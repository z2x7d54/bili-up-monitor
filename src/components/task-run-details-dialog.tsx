"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type TaskRunDetailItem = {
  name: string;
  mid: string | null;
  status: string;
  message: string | null;
};

type TaskRunDetailsDialogProps = {
  taskName: string;
  targetLabel: string;
  statusLabel: string;
  successCount: number;
  failureCount: number;
  itemCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  details: TaskRunDetailItem[];
  rawDetails: string | null;
};

function detailStatusLabel(status: string) {
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  return status;
}

export function TaskRunDetailsDialog({
  taskName,
  targetLabel,
  statusLabel,
  successCount,
  failureCount,
  itemCount,
  errorCode,
  errorMessage,
  details,
  rawDetails,
}: TaskRunDetailsDialogProps) {
  const failed = details.filter((item) => item.status === "failed");
  const success = details.filter((item) => item.status === "success");
  const targetCount = successCount + failureCount;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" className="shrink-0">
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>执行详情</DialogTitle>
          <DialogDescription>
            {taskName} · {statusLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border border-black/[0.055] bg-slate-50 p-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-slate-500">任务范围</div>
            <div className="mt-1 font-medium">{targetLabel}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">本次执行对象</div>
            <div className="mt-1 font-medium">
              {targetCount} 个，成功 {successCount} / 失败 {failureCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">抓取内容数</div>
            <div className="mt-1 font-medium">{itemCount}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">错误码</div>
            <div className="mt-1 font-medium">{errorCode || "-"}</div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          任务会抓取当前范围内所有未暂停的 UP；异常状态的 UP 会继续重试，已暂停的 UP 不会进入本次执行对象。
        </p>

        {errorMessage ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-lg border border-black/[0.055]">
            <div className="border-b border-black/[0.045] px-3 py-2 text-sm font-medium">
              失败 {failed.length}
            </div>
            <div className="max-h-64 overflow-auto p-3">
              {failed.length === 0 ? (
                <div className="text-sm text-slate-400">无失败 UP</div>
              ) : (
                <div className="space-y-2">
                  {failed.map((item, index) => (
                    <div key={`${item.mid || item.name}-${index}`} className="rounded-md bg-rose-50 p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-rose-800">{item.name}</span>
                        {item.mid ? <span className="text-xs text-rose-500">UID {item.mid}</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-rose-700">{item.message || "未记录失败原因"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-black/[0.055]">
            <div className="border-b border-black/[0.045] px-3 py-2 text-sm font-medium">
              成功 {success.length}
            </div>
            <div className="max-h-64 overflow-auto p-3">
              {success.length === 0 ? (
                <div className="text-sm text-slate-400">无成功 UP</div>
              ) : (
                <div className="space-y-1.5">
                  {success.map((item, index) => (
                    <div key={`${item.mid || item.name}-${index}`} className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                        {detailStatusLabel(item.status)}
                      </Badge>
                      <span className="font-medium">{item.name}</span>
                      {item.mid ? <span className="text-xs text-slate-400">UID {item.mid}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {details.length === 0 && rawDetails ? (
          <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            {rawDetails}
          </pre>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

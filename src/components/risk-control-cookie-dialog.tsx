"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RiskControlCookieDialog({
  open,
  onOpenChange,
  message,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-amber-50 text-amber-600">
              <AlertTriangle className="size-4" />
            </span>
            <DialogTitle>需要设置 B 站 Cookie</DialogTitle>
          </div>
          <DialogDescription>
            内容抓取触发了 B 站风控校验。请先到设置里填写已登录账号的 Cookie，然后再重新抓取。
          </DialogDescription>
        </DialogHeader>
        {message ? (
          <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            {message}
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">稍后处理</Button>
          </DialogClose>
          <Button asChild className="bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)]">
            <Link href="/settings">去设置 Cookie</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

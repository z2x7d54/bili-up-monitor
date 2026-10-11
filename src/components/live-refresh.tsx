"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(true);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    // Avoid disturbing forms or settings while the user edits them.
    if (!enabled || pathname === "/settings") return;
    function refresh() {
      if (document.visibilityState !== "visible" || document.querySelector('[role="dialog"]')) return;
      if (document.activeElement?.matches("input,textarea,select,[contenteditable=true]")) return;
      startTransition(() => router.refresh());
    }
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [enabled, pathname, router]);
  if (pathname === "/settings") return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-3 text-xs text-slate-500">
      <label className="inline-flex cursor-pointer items-center gap-1.5">
        <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
        每 30 秒刷新页面数据
      </label>
      <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
        className="inline-flex items-center gap-1 text-[var(--app-primary)] disabled:opacity-50">
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />{pending ? "刷新中" : "立即刷新"}
      </button>
    </div>
  );
}

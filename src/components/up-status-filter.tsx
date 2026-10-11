"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

type UpStatusFilterProps = {
  q?: string;
  group?: string;
  status?: string;
  sort?: string;
  order?: string;
  pageSize?: number;
  counts?: {
    all: number;
    monitoring: number;
    paused: number;
    error: number;
  };
};

export function UpStatusFilter({ q, group, status, sort, order, pageSize, counts }: UpStatusFilterProps) {
  const router = useRouter();
  const value = status || "ALL";

  function updateStatus(nextStatus: string) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (group && group !== "ALL") next.set("group", group);
    if (sort) next.set("sort", sort);
    if (order) next.set("order", order);
    if (pageSize && pageSize !== DEFAULT_PAGE_SIZE) next.set("pageSize", String(pageSize));
    if (nextStatus !== "ALL") next.set("status", nextStatus);

    const query = next.toString();
    router.replace(query ? `/ups?${query}` : "/ups");
  }

  return (
    <>
      {status && status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
      <Select value={value} onValueChange={updateStatus}>
        <SelectTrigger className="rounded-md border-black/[0.06] bg-white shadow-none sm:w-32">
          <SelectValue placeholder="全部状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">全部状态</SelectItem>
          <SelectItem value="MONITORING">监控中{counts ? ` ${counts.monitoring}` : ""}</SelectItem>
          <SelectItem value="PAUSED">已暂停{counts ? ` ${counts.paused}` : ""}</SelectItem>
          <SelectItem value="ERROR">异常{counts ? ` ${counts.error}` : ""}</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

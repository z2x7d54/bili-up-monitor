"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type RangeKey = "month" | "today" | "7d" | "30d" | "90d";

type TimelineFiltersProps = {
  range: RangeKey;
  group: string;
  creatorId: string;
  groups: { name: string }[];
  creators: { id: string; name: string }[];
};

const rangeOptions: { value: RangeKey; label: string }[] = [
  { value: "month", label: "本月" },
  { value: "today", label: "今天" },
  { value: "7d", label: "近7天" },
  { value: "30d", label: "近30天" },
  { value: "90d", label: "近90天" },
];

function hrefWith(searchParams: URLSearchParams, changes: Record<string, string | null>) {
  const next = new URLSearchParams(searchParams);
  next.delete("from");
  next.delete("to");

  Object.entries(changes).forEach(([key, value]) => {
    if (!value || value === "ALL") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  });

  const query = next.toString();
  return query ? `/timeline?${query}` : "/timeline";
}

export function TimelineFilters({ range, group, creatorId, groups, creators }: TimelineFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function applyChange(key: "group" | "creatorId", value: string) {
    const next = new URLSearchParams(searchParams);
    next.delete("from");
    next.delete("to");

    if (!value || value === "ALL") {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-8 items-center rounded-lg border border-black/[0.055] bg-white p-0.5">
        {rangeOptions.map((option) => (
          <Link
            key={option.value}
            href={hrefWith(searchParams, { range: option.value })}
            className={cn(
              "flex h-7 items-center rounded-md px-3 text-sm text-slate-600 transition",
              range === option.value
                ? "bg-[var(--app-primary-soft)] text-[var(--app-primary)] ring-1 ring-[var(--app-primary-ring)]"
                : "hover:bg-slate-50 hover:text-slate-950",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Select value={group} onValueChange={(value) => applyChange("group", value)}>
        <SelectTrigger className="h-8 min-w-[170px] border-black/[0.055] bg-white">
          <SelectValue placeholder="全部分组" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">全部分组</SelectItem>
          {groups.map((item) => (
            <SelectItem key={item.name} value={item.name}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={creatorId} onValueChange={(value) => applyChange("creatorId", value)}>
        <SelectTrigger className="h-8 min-w-[150px] border-black/[0.055] bg-white">
          <SelectValue placeholder="全部 UP 主" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">全部 UP 主</SelectItem>
          {creators.map((creator) => (
            <SelectItem key={creator.id} value={creator.id}>
              {creator.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

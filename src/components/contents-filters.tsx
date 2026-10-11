"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ContentsRangeKey = "month" | "24h" | "7d" | "30d" | "90d" | "180d" | "365d";

type ContentsFiltersProps = {
  range: ContentsRangeKey;
  q?: string;
  group: string;
  creatorId: string;
  groups: { name: string; path?: string }[];
  creators: { id: string; name: string }[];
};

const rangeOptions: { value: ContentsRangeKey; label: string }[] = [
  { value: "month", label: "本月" },
  { value: "24h", label: "近24h" },
  { value: "7d", label: "近7天" },
  { value: "30d", label: "近30天" },
  { value: "90d", label: "近90天" },
  { value: "180d", label: "近半年" },
  { value: "365d", label: "近一年" },
];

function cleanLegacyParams(params: URLSearchParams) {
  params.delete("page");
  params.delete("from");
  params.delete("to");
}

function hrefWith(searchParams: URLSearchParams, changes: Record<string, string | null>) {
  const next = new URLSearchParams(searchParams);
  cleanLegacyParams(next);

  Object.entries(changes).forEach(([key, value]) => {
    if (!value || value === "ALL") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  });

  const query = next.toString();
  return query ? `/contents?${query}` : "/contents";
}

export function ContentsFilters({ range, q, group, creatorId, groups, creators }: ContentsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pushWith(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    cleanLegacyParams(next);

    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === "ALL") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    pushWith({ q: String(formData.get("q") || "").trim() || null });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-h-8 flex-wrap items-center rounded-lg border border-black/[0.055] bg-white p-0.5">
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

      <form onSubmit={onSearch} className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          name="q"
          defaultValue={q}
          placeholder="搜索标题或 BV 号"
          className="h-8 w-[260px] border-black/[0.055] bg-white pl-9"
        />
      </form>

      <Select value={group} onValueChange={(value) => pushWith({ group: value })}>
        <SelectTrigger className="h-8 min-w-[150px] border-black/[0.055] bg-white">
          <SelectValue placeholder="全部分组" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">全部分组</SelectItem>
          {groups.map((item) => (
            <SelectItem key={item.name} value={item.name}>
              {item.path ?? item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={creatorId} onValueChange={(value) => pushWith({ creatorId: value })}>
        <SelectTrigger className="h-8 min-w-[150px] border-black/[0.055] bg-white">
          <SelectValue placeholder="全部 UP" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">全部 UP</SelectItem>
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

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_PAGE_SIZE, pageCount, PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type TablePaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  pageParam?: string;
  pageSizeParam?: string;
};

export function TablePagination({
  total,
  page,
  pageSize,
  pageParam = "page",
  pageSizeParam = "pageSize",
}: TablePaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = pageCount(total, pageSize);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(total, currentPage * pageSize);

  function hrefFor(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    const clampedPage = Math.min(Math.max(1, nextPage), totalPages);

    if (clampedPage <= 1) {
      next.delete(pageParam);
    } else {
      next.set(pageParam, String(clampedPage));
    }

    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function onPageSizeChange(value: string) {
    const next = new URLSearchParams(searchParams);
    const nextPageSize = Number.parseInt(value, 10);

    next.delete(pageParam);
    if (nextPageSize === DEFAULT_PAGE_SIZE) {
      next.delete(pageSizeParam);
    } else {
      next.set(pageSizeParam, String(nextPageSize));
    }

    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.045] px-4 py-3 text-sm text-slate-500">
      <div>
        显示 {start}-{end} / 共 {total} 条
      </div>
      <div className="flex items-center gap-2">
        <span>每页</span>
        <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
          <SelectTrigger size="sm" className="h-7 w-[78px] border-black/[0.055] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          asChild
          variant="outline"
          size="icon-sm"
          aria-label="上一页"
          className={cn(currentPage <= 1 && "pointer-events-none opacity-50")}
        >
          <Link href={hrefFor(currentPage - 1)} aria-disabled={currentPage <= 1} tabIndex={currentPage <= 1 ? -1 : undefined}>
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <span className="min-w-14 text-center tabular-nums text-slate-600">
          {currentPage}/{totalPages}
        </span>
        <Button
          asChild
          variant="outline"
          size="icon-sm"
          aria-label="下一页"
          className={cn(currentPage >= totalPages && "pointer-events-none opacity-50")}
        >
          <Link href={hrefFor(currentPage + 1)} aria-disabled={currentPage >= totalPages} tabIndex={currentPage >= totalPages ? -1 : undefined}>
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type SortHeaderProps = {
  href: string;
  active: boolean;
  order: "asc" | "desc";
  children: ReactNode;
  className?: string;
  title?: string;
};

export function SortHeader({ href, active, order, children, className, title }: SortHeaderProps) {
  return (
    <Link
      href={href}
      scroll={false}
      title={title}
      className={cn(
        "group flex w-full min-w-0 items-center justify-between gap-3 rounded-sm text-inherit transition hover:text-slate-950",
        className,
      )}
    >
      <span className={cn("truncate", active && "text-slate-950")}>{children}</span>
      <span
        className={cn(
          "flex shrink-0 flex-col items-center gap-[2px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          active && "opacity-100",
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "h-0 w-0 border-x-[4px] border-b-[5px] border-x-transparent transition-colors",
            active && order === "asc"
              ? "border-b-[var(--app-primary)]"
              : "border-b-slate-300 group-hover:border-b-slate-400",
          )}
        />
        <span
          className={cn(
            "h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent transition-colors",
            active && order === "desc"
              ? "border-t-[var(--app-primary)]"
              : "border-t-slate-300 group-hover:border-t-slate-400",
          )}
        />
      </span>
    </Link>
  );
}

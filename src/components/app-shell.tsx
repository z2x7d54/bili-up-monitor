"use client";
import { NotificationCenter } from "@/components/notification-center";
import { LiveRefresh } from "@/components/live-refresh";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Database,
  Clock3,
  Home,
  Menu,
  Settings,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SchedulerBoot } from "@/components/scheduler-boot";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "看板", icon: Home },
  { href: "/ups", label: "博主监控库", icon: UserRound },
  { href: "/contents", label: "内容监控库", icon: Database },
  { href: "/groups", label: "分组管理", icon: ClipboardList },
  { href: "/data", label: "数据统计", icon: Database },
  { href: "/timeline", label: "内容时间线", icon: Clock3 },
  { href: "/tasks", label: "监控任务", icon: ClipboardList },
  { href: "/settings", label: "设置", icon: Settings },
];

function NavLinks({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return (
    <nav className={cn("space-y-1.5", mobile && "px-4")}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        const link = (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-slate-600 transition",
              active
                ? "bg-[var(--app-primary-soft)] font-semibold text-[var(--app-primary)]"
                : "hover:bg-slate-100 hover:text-slate-950",
            )}
          >
            <Icon className="size-[17px]" />
            {item.label}
          </Link>
        );

        if (!mobile) return link;

        return (
          <SheetClose key={item.href} asChild>
            {link}
          </SheetClose>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <SchedulerBoot />
      <aside className="fixed inset-y-0 left-0 hidden w-[260px] border-r border-[#f0f1f4] bg-[#F7F7F7] px-4 py-8 lg:block">
        <div className="mb-8 px-2">
          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-700">B站UP主监控系统</div>
          </div>
        </div>

        <NavLinks pathname={pathname} />
      </aside>
      <main className="min-h-screen bg-white lg:pl-[260px]">
        <div className="relative min-h-screen px-4 py-4 sm:px-6 lg:px-10 lg:py-9">
          <div className="mb-4 flex h-14 items-center justify-between rounded-lg border border-black/[0.055] bg-white px-3 shadow-none lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9 text-slate-700" aria-label="打开菜单">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] bg-[#F7F7F7] p-0 sm:max-w-[280px]">
                <SheetHeader className="border-b border-[#eceef2] px-5 py-5 text-left">
                  <SheetTitle asChild>
                    <div className="min-w-0">
                      <div className="text-lg font-bold text-slate-700">B站UP主监控系统</div>
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <div className="py-4">
                  <NavLinks pathname={pathname} mobile />
                </div>
              </SheetContent>
            </Sheet>
            <div className="flex min-w-0 items-center justify-center font-semibold">
              <span className="text-sm font-bold text-slate-700">B站UP主监控系统</span>
            </div>
            <div className="size-9" aria-hidden="true" />
          </div>
          <div className="flex flex-wrap items-start justify-end gap-4"><LiveRefresh /><NotificationCenter /></div>
          {children}
        </div>
      </main>
    </div>
  );
}

import { creatorDisplayName } from "@/lib/creator-personal";
import { MonthlyDashboard } from "@/components/monthly-dashboard";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  LoaderCircle,
  PlaySquare,
  RefreshCcw,
  UsersRound,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { biliVideoUrl, formatDurationFromSeconds } from "@/lib/bilibili/utils";
import { getDashboardData } from "@/lib/monitor/service";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, formatSignedNumber, statusLabel } from "@/lib/view-format";

export const dynamic = "force-dynamic";

function relativeTime(value: Date | string | null | undefined, now = new Date()) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const diffSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffSeconds < 60) return "刚刚";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;
  return formatDateTime(date);
}

function formatIntervalLabel(minutes: number | null | undefined) {
  if (!minutes) return null;
  if (minutes < 60) return `每 ${minutes} 分钟一次`;
  if (minutes % 60 === 0) return `每 ${minutes / 60} 小时一次`;
  return `每 ${minutes} 分钟一次`;
}

function compactSigned(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : formatSignedNumber(value);
}

function statusTone(status: string) {
  if (status === "SUCCESS" || status === "MONITORING") return "text-emerald-500";
  if (status === "RUNNING" || status === "ACTIVE") return "text-blue-500";
  if (status === "PARTIAL") return "text-amber-500";
  if (status === "FAILED" || status === "ERROR") return "text-rose-500";
  return "text-slate-500";
}

function runIcon(status: string) {
  if (status === "SUCCESS") return CheckCircle2;
  if (status === "RUNNING") return LoaderCircle;
  if (status === "FAILED") return XCircle;
  if (status === "PARTIAL") return AlertTriangle;
  return Clock3;
}

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1
      ? "bg-amber-400 text-white"
      : rank === 2
        ? "bg-slate-300 text-white"
        : rank === 3
          ? "bg-orange-400 text-white"
          : "bg-transparent text-slate-600";

  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold", tone)}>
      {rank}
    </span>
  );
}

function GrowthValue({ value }: { value: number | null | undefined }) {
  return (
    <span className="inline-flex items-center justify-end font-semibold tabular-nums text-[var(--app-primary)]">
      {compactSigned(value)}
    </span>
  );
}

function DashboardCard({
  icon,
  label,
  value,
  subLabel,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  subLabel: ReactNode;
  tone: "pink" | "blue" | "rose" | "green";
}) {
  const toneClass = {
    pink: "bg-pink-50 text-pink-500",
    blue: "bg-blue-50 text-blue-500",
    rose: "bg-rose-50 text-rose-500",
    green: "bg-emerald-50 text-emerald-500",
  }[tone];

  return (
    <section className="flex min-h-[84px] items-center gap-3 rounded-lg border border-black/[0.045] bg-white px-4 py-3">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", toneClass)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</div>
        <div className="mt-1 text-xs text-slate-400">{subLabel}</div>
      </div>
    </section>
  );
}

function SectionCard({
  title,
  info,
  href,
  children,
  className,
}: {
  title: string;
  info?: string;
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-black/[0.045] bg-white", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-normal text-slate-950">{title}</h2>
          {info ? <Info className="size-3.5 text-slate-300" aria-label={info} /> : null}
        </div>
        {href ? (
          <Button asChild variant="ghost" size="xs" className="text-blue-600 hover:text-blue-700">
            <Link href={href}>
              查看全部
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const now = new Date();
  const data = await getDashboardData({
    recentContentsPage: 1,
    recentContentsPageSize: 8,
  });

  const latestRun = data.recentRuns[0];
  const latestStatus = data.latestCollection?.status ?? latestRun?.status;
  const latestStatusLabel = latestStatus ? statusLabel(latestStatus) : "暂无采集";
  const latestTime = data.latestCollection?.at ?? latestRun?.finishedAt ?? latestRun?.startedAt;
  const latestIntervalLabel = formatIntervalLabel(data.latestCollection?.intervalMinutes ?? latestRun?.task?.intervalMinutes);
  const latestLabel = latestIntervalLabel ?? data.latestCollection?.label ?? latestRun?.task?.name ?? "等待任务运行";

  return (
    <div className="space-y-6">
      <MonthlyDashboard params={params} />
      <h2 className="pt-4 text-lg font-semibold">采集状态与增长趋势</h2>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          tone="pink"
          icon={<UsersRound className="size-5" />}
          label="监控 UP 主"
          value={formatNumber(data.stats.monitoringCount)}
          subLabel={
            <span>全部 {formatNumber(data.stats.creatorCount)} 个</span>
          }
        />
        <DashboardCard
          tone="blue"
          icon={<PlaySquare className="size-5" />}
          label="今日新增视频"
          value={formatNumber(data.stats.todayContentCount)}
          subLabel={<span>内容总数 {formatNumber(data.stats.contentCount)} 条</span>}
        />
        <DashboardCard
          tone="rose"
          icon={<AlertTriangle className="size-5" />}
          label="异常监控数量"
          value={formatNumber(data.stats.errorCreatorCount)}
          subLabel={
            data.stats.errorCreatorCount > 0 ? (
              <span className="text-rose-500">需要处理失败采集</span>
            ) : (
              <span className="text-emerald-500">当前运行正常</span>
            )
          }
        />
        <DashboardCard
          tone="green"
          icon={<RefreshCcw className="size-5" />}
          label="最近采集"
          value={
            <span className={cn("inline-flex items-center gap-1.5", statusTone(latestStatus ?? ""))}>
              <span className="size-2 rounded-full bg-current" />
              {latestStatusLabel}
            </span>
          }
          subLabel={
            <span className="block max-w-48 truncate" title={latestLabel}>
              {relativeTime(latestTime, now)} · {latestLabel}
            </span>
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <SectionCard title="博主涨粉排行榜" info="按 24h 粉丝增长排序" href="/ups?sort=followers24h&order=desc">
          <div className="mt-3 px-4 pb-4">
            <div className="grid grid-cols-[42px_minmax(0,1fr)_96px_112px] px-1 pb-2 text-xs font-medium text-slate-400">
              <span>排名</span>
              <span>UP 主</span>
              <span className="text-right">粉丝数</span>
              <span className="text-right">24h 涨粉数</span>
            </div>
            <div className="space-y-1.5">
              {data.creatorGrowthRanking.length === 0 ? (
                <div className="flex h-28 items-center justify-center text-xs text-slate-500">
                  暂无快照数据，执行采集后会形成排行榜。
                </div>
              ) : (
                data.creatorGrowthRanking.map((creator, index) => (
                  <div key={creator.id} className="grid grid-cols-[42px_minmax(0,1fr)_96px_112px] items-center px-1 py-1">
                    <RankBadge rank={index + 1} />
                    <div className="flex min-w-0 items-center gap-2.5">
                      {creator.avatarUrl ? (
                        <Image src={creator.avatarUrl} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">
                          {creatorDisplayName(creator).slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{creatorDisplayName(creator)}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{formatNumber(creator.videoCount)} 稿件</div>
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-slate-700">{formatNumber(creator.followerCount)}</div>
                    <GrowthValue value={creator.growth24h} />
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="内容播放增长排行榜" info="按 24h 播放增长排序" href="/contents?sort=viewsTrend&order=desc&trendWindow=24h">
          <div className="mt-3 px-4 pb-4">
            <div className="grid grid-cols-[34px_minmax(320px,1fr)_128px_120px] gap-x-3 px-1 pb-2 text-xs font-medium text-slate-400">
              <span>排名</span>
              <span className="text-center">视频</span>
              <span className="text-center">UP 主</span>
              <span className="text-right">24h 播放增长</span>
            </div>
            <div className="space-y-2">
              {data.contentGrowthRanking.length === 0 ? (
                <div className="flex h-28 items-center justify-center text-xs text-slate-500">
                  暂无内容数据，执行采集后会形成播放增长榜。
                </div>
              ) : (
                data.contentGrowthRanking.map((content, index) => {
                  const durationText = formatDurationFromSeconds(content.durationSeconds);

                  return (
                  <div key={content.id} className="grid grid-cols-[34px_minmax(320px,1fr)_128px_120px] items-center gap-x-3 px-1 py-0.5">
                    <RankBadge rank={index + 1} />
                    <div className="flex min-w-0 items-center gap-2.5">
                      <a
                        href={biliVideoUrl(content.bvid)}
                        target="_blank"
                        rel="noreferrer"
                        className="relative h-11 w-[72px] shrink-0 overflow-hidden rounded-md bg-slate-100"
                      >
                        {content.coverUrl ? (
                          <Image src={content.coverUrl} alt="" fill sizes="72px" className="object-cover" />
                        ) : null}
                        {durationText ? (
                          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                            {durationText}
                          </span>
                        ) : null}
                      </a>
                      <div className="min-w-0">
                        <a
                          href={biliVideoUrl(content.bvid)}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 hover:text-[var(--app-primary)]"
                        >
                          {content.title}
                        </a>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center justify-center gap-2">
                      {content.creator.avatarUrl ? (
                        <Image
                          src={content.creator.avatarUrl}
                          alt=""
                          width={24}
                          height={24}
                          className="size-6 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                          {creatorDisplayName(content.creator).slice(0, 1)}
                        </div>
                      )}
                      <span className="truncate text-sm text-slate-700">{creatorDisplayName(content.creator)}</span>
                    </div>
                    <GrowthValue value={content.growth24h} />
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </SectionCard>
      </section>

      <SectionCard title="最近发布" href="/timeline" className="border-0 bg-transparent">
        <div className="mt-3 grid gap-3 px-4 pb-4 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
          {data.recentContents.length === 0 ? (
            <div className="col-span-full flex h-28 items-center justify-center text-xs text-slate-500">
              暂无发布内容，先执行一次监控任务。
            </div>
          ) : (
            data.recentContents.slice(0, 5).map((content, index) => (
              <a
                key={content.id}
                href={biliVideoUrl(content.bvid)}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "min-h-[72px] min-w-0 grid-cols-[112px_minmax(0,1fr)] gap-2 rounded-lg border border-black/[0.045] bg-white p-2 transition-colors hover:border-black/[0.08]",
                  index >= 4 ? "hidden 2xl:grid" : "grid",
                )}
              >
                <div className="relative aspect-video overflow-hidden rounded-md bg-slate-100">
                  {content.coverUrl ? <Image src={content.coverUrl} alt="" fill sizes="112px" className="object-cover" /> : null}
                  {content.durationText ? (
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 text-[11px] font-medium text-white">
                      {content.durationText}
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 py-1">
                  <div className="line-clamp-2 text-xs font-semibold leading-4 text-slate-950">{content.title}</div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-slate-400">
                    <div className="min-w-0 flex-1 truncate">{creatorDisplayName(content.creator)}</div>
                    <div className="shrink-0 whitespace-nowrap">{relativeTime(content.publishedAt, now)}</div>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard title="最近任务运行" href="/tasks" className="border-0 bg-transparent">
        <div className="mt-3 grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-4">
          {data.recentRuns.length === 0 ? (
            <div className="col-span-full flex h-28 items-center justify-center text-xs text-slate-500">
              暂无任务运行记录。
            </div>
          ) : (
            data.recentRuns.slice(0, 4).map((run) => {
              const Icon = runIcon(run.status);
              return (
                <div key={run.id} className="rounded-lg border border-black/[0.045] bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">{run.task?.name || "已删除任务"}</div>
                      <div className="mt-1 text-xs text-slate-400">{relativeTime(run.finishedAt || run.startedAt, now)}</div>
                    </div>
                    <Icon className={cn("size-4 shrink-0", statusTone(run.status), run.status === "RUNNING" ? "animate-spin" : "")} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className={cn("font-semibold", statusTone(run.status))}>{statusLabel(run.status)}</span>
                    <span className="text-slate-400">
                      成功 {run.successCount} · 失败 {run.failureCount}
                    </span>
                  </div>
                  {run.errorMessage ? <div className="mt-2 line-clamp-1 text-xs text-rose-500">{run.errorMessage}</div> : null}
                </div>
              );
            })
          )}
        </div>
      </SectionCard>
    </div>
  );
}

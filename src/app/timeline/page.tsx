import { creatorDisplayName } from "@/lib/creator-personal";
import { businessDates } from "@/lib/monthly";
import Image from "next/image";
import Link from "next/link";
import {
  Download,
  Grid2X2,
  List,
  MessageSquare,
  MoreHorizontal,
  Play,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimelineFilters } from "@/components/timeline-filters";
import { biliVideoUrl, formatDurationFromSeconds } from "@/lib/bilibili/utils";
import { prisma } from "@/lib/db";
import { listCreatorGroups, getGroupScope } from "@/lib/groups";
import { cn } from "@/lib/utils";
import { formatNumber, formatSignedNumber } from "@/lib/view-format";

type PageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

type RangeKey = "month" | "today" | "7d" | "30d" | "90d";
type SortKey = "published_desc" | "published_asc" | "view_desc" | "interaction_desc" | "danmaku_desc" | "favorite_desc";
type ViewKey = "timeline" | "bili";

const TIME_ZONE = "Asia/Shanghai";
const DAY_MS = 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

function safeRange(value: string | undefined): RangeKey {
  if (value === "month" || value === "today" || value === "7d" || value === "30d" || value === "90d") return value;
  return "30d";
}

function safeView(value: string | undefined): ViewKey {
  return value === "bili" ? "bili" : "timeline";
}

function safeSort(value: string | undefined, view: ViewKey): SortKey {
  if (
    value === "published_desc" ||
    value === "published_asc" ||
    value === "view_desc" ||
    value === "interaction_desc" ||
    value === "danmaku_desc" ||
    value === "favorite_desc"
  ) {
    return value;
  }
  return view === "bili" ? "interaction_desc" : "published_desc";
}

function getDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value || "1970",
    month: parts.find((part) => part.type === "month")?.value || "01",
    day: parts.find((part) => part.type === "day")?.value || "01",
  };
}

function dateKey(date: Date) {
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateFromKey(key: string, endOfDay = false) {
  return new Date(`${key}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`);
}

function offsetDateKey(key: string, days: number) {
  const date = dateFromKey(key);
  date.setTime(date.getTime() + days * DAY_MS);
  return dateKey(date);
}

function formatTime(value: Date | null) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function formatDateLabel(key: string, todayKey: string) {
  if (key === todayKey) return `${key}（今天）`;
  if (key === offsetDateKey(todayKey, -1)) return `${key}（昨天）`;
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(dateFromKey(key));
  return `${key}（${weekday}）`;
}

function formatRelative(value: Date | null, now: Date, todayKey: string) {
  if (!value) return "-";
  const diff = now.getTime() - value.getTime();
  if (diff >= 0 && diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`;
  if (diff >= 0 && diff < DAY_MS) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
  const key = dateKey(value);
  if (key === todayKey) return "今天";
  if (key === offsetDateKey(todayKey, -1)) return "昨天";
  return key.slice(5);
}

function formatBiliDate(value: Date | null, now: Date) {
  if (!value) return "-";
  const options: Intl.DateTimeFormatOptions =
    value.getFullYear() === now.getFullYear()
      ? { month: "2-digit", day: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" };
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIME_ZONE,
    ...options,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function trendClass(value: number | null) {
  if (value === null || Number.isNaN(value)) return "text-slate-400";
  if (value > 0) return "text-rose-600";
  if (value < 0) return "text-emerald-600";
  return "text-slate-500";
}

function formatInteractionRate(item: {
  viewCount: number;
  replyCount: number;
  favoriteCount: number;
  coinCount: number;
  shareCount: number;
  likeCount: number;
}) {
  if (!item.viewCount) return "-";
  const interactions =
    item.replyCount + item.favoriteCount + item.coinCount + item.shareCount + item.likeCount;
  return `${((interactions / item.viewCount) * 100).toFixed(2)}%`;
}

function buildHref(params: URLSearchParams, changes: Record<string, string | null>) {
  const next = new URLSearchParams(params);
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

const biliSortOptions: { value: SortKey; label: string }[] = [
  { value: "interaction_desc", label: "综合排序" },
  { value: "view_desc", label: "最多播放" },
  { value: "published_desc", label: "最新发布" },
  { value: "danmaku_desc", label: "最多弹幕" },
  { value: "favorite_desc", label: "最多收藏" },
];

function exportHref(input: { from: string; to: string; group: string; creatorId: string }) {
  const next = new URLSearchParams({ from: input.from, to: input.to });
  if (input.group !== "ALL") next.set("group", input.group);
  if (input.creatorId !== "ALL") next.set("creatorId", input.creatorId);
  const query = next.toString();
  return query ? `/api/contents?${query}` : "/api/contents";
}

export default async function TimelinePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) urlParams.set(key, value);
  });

  const now = new Date();
  const todayKey = dateKey(now);
  const range = safeRange(params.range);
  const view = safeView(params.view);
  const sort = safeSort(params.sort, view);
  const group = params.group?.trim() || "ALL";
  const creatorId = params.creatorId?.trim() || "ALL";

  const defaultFromKey =
    range === "today"
      ? todayKey
      : range === "7d"
        ? offsetDateKey(todayKey, -6)
        : range === "90d"
          ? offsetDateKey(todayKey, -89)
          : offsetDateKey(todayKey, -29);
  const fromKey = range === "month" ? businessDates(now).monthKey + "-01" : defaultFromKey;
  const toKey = todayKey;
  const fromDate = dateFromKey(fromKey <= toKey ? fromKey : toKey);
  const toDate = dateFromKey(fromKey <= toKey ? toKey : fromKey, true);

  const [contents, creators, groups] = await Promise.all([
    prisma.contentItem.findMany({
      where: {
        publishedAt: { gte: fromDate, lte: toDate },
        ...(creatorId !== "ALL" ? { creatorId } : {}),
        ...(group !== "ALL" ? { creator: { groupName: { in: await getGroupScope(group) } } } : {}),
      },
      include: { creator: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      ...(range === "month" ? {} : { take: 300 }),
    }),
    prisma.upCreator.findMany({
      select: { id: true, name: true, alias: true },
      orderBy: { name: "asc" },
    }),
    listCreatorGroups(),
  ]);

  const contentIds = contents.map((item) => item.id);
  const baselineSnapshots = contentIds.length
    ? await prisma.metricSnapshot.findMany({
        where: {
          contentId: { in: contentIds },
          capturedAt: { lte: new Date(now.getTime() - DAY_MS) },
          viewCount: { not: null },
        },
        orderBy: { capturedAt: "desc" },
      })
    : [];
  const baselineByContentId = new Map<string, (typeof baselineSnapshots)[number]>();
  baselineSnapshots.forEach((snapshot) => {
    if (snapshot.contentId && !baselineByContentId.has(snapshot.contentId)) {
      baselineByContentId.set(snapshot.contentId, snapshot);
    }
  });

  const timelineItems = contents.map((item) => {
    const baseline = baselineByContentId.get(item.id);
    const baselineViews = baseline?.viewCount ?? null;
    const viewDelta = baselineViews === null ? null : item.viewCount - baselineViews;
    const growthRate = baselineViews && baselineViews > 0 ? (viewDelta! / baselineViews) * 100 : null;
    return {
      ...item,
      viewDelta,
      growthRate,
      interactionRate: formatInteractionRate(item),
    };
  });

  const sortedItems = [...timelineItems].sort((a, b) => {
    if (sort === "published_asc") {
      return (a.publishedAt?.getTime() || 0) - (b.publishedAt?.getTime() || 0);
    }
    if (sort === "view_desc") return b.viewCount - a.viewCount;
    if (sort === "danmaku_desc") return b.danmakuCount - a.danmakuCount;
    if (sort === "favorite_desc") return b.favoriteCount - a.favoriteCount;
    if (sort === "interaction_desc") {
      const aInteractions = a.replyCount + a.favoriteCount + a.coinCount + a.shareCount + a.likeCount;
      const bInteractions = b.replyCount + b.favoriteCount + b.coinCount + b.shareCount + b.likeCount;
      return bInteractions - aInteractions;
    }
    return (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0);
  });

  const grouped = sortedItems.reduce<Map<string, typeof sortedItems>>((map, item) => {
    const key = item.publishedAt ? dateKey(item.publishedAt) : "未标记日期";
    map.set(key, [...(map.get(key) || []), item]);
    return map;
  }, new Map());
  const groupEntries = [...grouped.entries()].sort(([a], [b]) =>
    sort === "published_asc" ? a.localeCompare(b) : b.localeCompare(a),
  );

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">内容时间线</h1>
          <p className="mt-1 text-sm text-slate-500">按发布时间追踪已监控 UP 的公开视频内容</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(urlParams, {})}>
              <RefreshCw className="size-4" />
              刷新
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={exportHref({ from: fromKey, to: toKey, group, creatorId })}>
              <Download className="size-4" />
              导出数据
            </Link>
          </Button>
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <TimelineFilters
            range={range}
            group={group}
            creatorId={creatorId}
            groups={groups}
            creators={creators.map(c=>({...c,name:creatorDisplayName(c)}))}
          />
          <div className="flex h-8 w-fit items-center rounded-lg border border-black/[0.055] bg-white p-0.5">
            <Link
              href={buildHref(urlParams, { view: null, sort: null })}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-3 text-sm text-slate-600 transition",
                view === "timeline"
                  ? "bg-[var(--app-primary-soft)] text-[var(--app-primary)] ring-1 ring-[var(--app-primary-ring)]"
                  : "hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              <List className="size-3.5" />
              时间线视图
            </Link>
            <Link
              href={buildHref(urlParams, { view: "bili", sort: "interaction_desc" })}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-3 text-sm text-slate-600 transition",
                view === "bili"
                  ? "bg-[var(--app-primary-soft)] text-[var(--app-primary)] ring-1 ring-[var(--app-primary-ring)]"
                  : "hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              <Grid2X2 className="size-3.5" />
              B站视图
            </Link>
          </div>
        </div>
      </section>

      {groupEntries.length === 0 ? (
        <section className="rounded-lg border border-dashed border-black/[0.08] py-16 text-center">
          <div className="text-sm font-medium text-slate-700">当前范围内没有内容</div>
          <p className="mt-1 text-sm text-slate-500">可以切换到近90天，或先执行一次监控任务同步内容。</p>
        </section>
      ) : view === "bili" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-5 sm:gap-7">
              {biliSortOptions.map((option) => (
                <Link
                  key={option.value}
                  href={buildHref(urlParams, { view: "bili", sort: option.value })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition",
                    sort === option.value
                      ? "bg-sky-50 text-sky-600"
                      : "hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  {option.label}
                </Link>
              ))}
            </div>
            <div className="text-sm text-slate-400">共 {sortedItems.length} 条内容</div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-5 gap-y-8">
            {sortedItems.map((item) => {
              const durationText = formatDurationFromSeconds(item.durationSeconds);
              const href = biliVideoUrl(item.bvid);

              return (
                <article key={item.id} className="group min-w-0">
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="relative block aspect-video overflow-hidden rounded-md bg-slate-100"
                  >
                    {item.coverUrl ? (
                      <Image
                        src={item.coverUrl}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 20vw"
                        className="object-cover transition duration-200 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-slate-100 text-sm text-slate-400">
                        无封面
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-linear-to-t from-black/65 via-black/25 to-transparent px-2.5 pb-2 pt-8 text-white">
                      <div className="flex min-w-0 items-center gap-3 text-xs font-medium">
                        <span className="flex items-center gap-1">
                          <Play className="size-3.5 fill-white" />
                          {formatNumber(item.viewCount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="size-3.5" />
                          {formatNumber(item.danmakuCount)}
                        </span>
                      </div>
                      {durationText ? <span className="shrink-0 text-xs font-medium">{durationText}</span> : null}
                    </div>
                  </a>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block min-h-11 overflow-hidden text-[15px] font-semibold leading-[1.45] tracking-normal text-slate-950 hover:text-[var(--app-primary)]"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.title}
                  </a>
                  <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                    <span className="inline-flex h-4 shrink-0 items-center rounded border border-slate-300 px-0.5 text-[10px] font-bold leading-none text-slate-400">
                      UP
                    </span>
                    <span className="truncate">{creatorDisplayName(item.creator)}</span>
                    <span className="shrink-0">·</span>
                    <time className="shrink-0" dateTime={item.publishedAt?.toISOString()}>
                      {formatBiliDate(item.publishedAt, now)}
                    </time>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          {groupEntries.map(([key, items]) => (
            <section key={key} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">{formatDateLabel(key, todayKey)}</h2>
                <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-500">
                  {items.length} 条内容
                </Badge>
              </div>
              <div className="overflow-x-auto rounded-lg border border-black/[0.055] bg-white">
                <div className="min-w-[1240px]">
                  <div className="grid grid-cols-[90px_180px_minmax(460px,1fr)_120px_110px_90px_170px_40px] gap-x-8 border-b border-black/[0.045] bg-muted/60 px-5 py-3 text-xs text-slate-500">
                    <div>发布时间</div>
                    <div>UP 主</div>
                    <div>内容</div>
                    <div>播放量</div>
                    <div>24h 增长</div>
                    <div>互动率</div>
                    <div>标签</div>
                    <div />
                  </div>
                  {items.map((item) => {
                    const durationText = formatDurationFromSeconds(item.durationSeconds);

                    return (
                    <div
                      key={item.id}
                      className="grid min-h-[104px] grid-cols-[90px_180px_minmax(460px,1fr)_120px_110px_90px_170px_40px] items-center gap-x-8 border-b border-black/[0.045] px-5 py-4 last:border-b-0 hover:bg-slate-50/70"
                    >
                      <div>
                        <div className="font-medium">{formatTime(item.publishedAt)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatRelative(item.publishedAt, now, todayKey)}
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-3">
                        {item.creator.avatarUrl ? (
                          <Image
                            src={item.creator.avatarUrl}
                            alt=""
                            width={44}
                            height={44}
                            className="size-11 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium">
                            {creatorDisplayName(item.creator).slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{creatorDisplayName(item.creator)}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            粉丝 {formatNumber(item.creator.followerCount)}
                          </div>
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-4">
                        <a
                          href={biliVideoUrl(item.bvid)}
                          target="_blank"
                          rel="noreferrer"
                          className="relative block h-[58px] w-[104px] shrink-0 overflow-hidden rounded-md bg-slate-100"
                        >
                          {item.coverUrl ? (
                            <Image src={item.coverUrl} alt="" fill sizes="104px" className="object-cover transition-opacity hover:opacity-85" />
                          ) : null}
                          {durationText ? (
                            <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[10px] text-white">
                              {durationText}
                            </span>
                          ) : null}
                        </a>
                        <div className="min-w-0">
                          <a
                            href={biliVideoUrl(item.bvid)}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-2 text-sm font-medium leading-5 hover:text-[var(--app-primary)]"
                          >
                            {item.title}
                          </a>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            <a href={biliVideoUrl(item.bvid)} target="_blank" rel="noreferrer" className="hover:text-slate-900">
                              {item.bvid}
                            </a>
                            {item.category ? ` · ${item.category}` : ""}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="font-medium">{formatNumber(item.viewCount)}</div>
                        <div className={cn("mt-1 text-xs font-medium tabular-nums", trendClass(item.viewDelta))}>
                          {item.viewDelta === null
                            ? "-"
                            : formatSignedNumber(item.viewDelta)}
                        </div>
                      </div>
                      <div className={cn("font-medium", trendClass(item.growthRate))}>
                        {formatPercent(item.growthRate)}
                      </div>
                      <div className="font-medium">{item.interactionRate}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.category ? (
                          <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-600">
                            {item.category}
                          </Badge>
                        ) : null}
                        <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-600">
                          {item.creator.groupName}
                        </Badge>
                      </div>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon-sm" aria-label="更多操作">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

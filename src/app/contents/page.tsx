import { creatorDisplayName } from "@/lib/creator-personal";
import { businessDates } from "@/lib/monthly";
import type { ReactNode } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { ContentsFilters, type ContentsRangeKey } from "@/components/contents-filters";
import { SortHeader } from "@/components/sort-header";
import { TableEmptyState } from "@/components/table-empty-state";
import { TablePagination } from "@/components/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { biliVideoUrl, formatDurationFromSeconds } from "@/lib/bilibili/utils";
import { prisma } from "@/lib/db";
import { listCreatorGroups, getGroupScope } from "@/lib/groups";
import { DEFAULT_PAGE_SIZE, paginateItems, parsePage, parsePageSize } from "@/lib/pagination";
import {
  compareNullableDate,
  compareNullableNumber,
  compareNumber,
  compareString,
  parseSortOrder,
  type SortOrder,
} from "@/lib/table-sort";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatDateTime,
  formatFullDateTime,
  formatNumber,
  formatReadablePublishTime,
  formatSignedNumber,
} from "@/lib/view-format";

type PageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ContentSnapshot = {
  contentId: string | null;
  capturedAt: Date;
  viewCount: number | null;
  danmakuCount: number | null;
  replyCount: number | null;
  favoriteCount: number | null;
  coinCount: number | null;
  shareCount: number | null;
  likeCount: number | null;
};

type ContentSortKey =
  | "title"
  | "creatorName"
  | "groupName"
  | "viewCount"
  | "viewsTrend"
  | "interactionTotal"
  | "interactionsTrend"
  | "favoriteCount"
  | "publishedAt"
  | "lastFetchedAt";

const CONTENT_SORT_KEYS = new Set<ContentSortKey>([
  "title",
  "creatorName",
  "groupName",
  "viewCount",
  "viewsTrend",
  "interactionTotal",
  "interactionsTrend",
  "favoriteCount",
  "publishedAt",
  "lastFetchedAt",
]);

type TrendWindow = "1h" | "24h" | "7d";

const CONTENT_RANGE_DURATIONS: Record<ContentsRangeKey, number> = {
  "month": 0,
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
  "180d": 180 * DAY_MS,
  "365d": 365 * DAY_MS,
};

function parseContentSort(value: string | undefined) {
  if (value === "views24h") return "viewsTrend";
  if (value === "interactions24h") return "interactionsTrend";
  return value && CONTENT_SORT_KEYS.has(value as ContentSortKey) ? (value as ContentSortKey) : null;
}

function defaultContentSortOrder(sort: ContentSortKey | null): SortOrder {
  return sort === "title" || sort === "creatorName" || sort === "groupName" ? "asc" : "desc";
}

function parseContentsRange(value: string | undefined): ContentsRangeKey {
  return value && value in CONTENT_RANGE_DURATIONS ? (value as ContentsRangeKey) : "30d";
}

function parseTrendWindow(value: string | undefined): TrendWindow {
  if (value === "24h" || value === "7d") return value;
  return "1h";
}

function latestSnapshotNearBaseline(
  snapshots: ContentSnapshot[],
  contentId: string,
  cutoff: Date,
  toleranceMs: number,
) {
  const earliest = cutoff.getTime() - toleranceMs;
  return snapshots.find(
    (snapshot) =>
      snapshot.contentId === contentId &&
      snapshot.capturedAt.getTime() <= cutoff.getTime() &&
      snapshot.capturedAt.getTime() >= earliest,
  );
}

function delta(current: number, baseline: number | null | undefined) {
  if (baseline === null || baseline === undefined) return null;
  return current - baseline;
}

function interactionTotal(input: {
  danmakuCount: number | null;
  replyCount: number | null;
  favoriteCount: number | null;
  coinCount: number | null;
  shareCount: number | null;
  likeCount: number | null;
}) {
  return (
    (input.danmakuCount ?? 0) +
    (input.replyCount ?? 0) +
    (input.favoriteCount ?? 0) +
    (input.coinCount ?? 0) +
    (input.shareCount ?? 0) +
    (input.likeCount ?? 0)
  );
}

function trendSortValue(
  trend:
    | {
        views1h: number | null;
        views24h: number | null;
        views7d: number | null;
        interactions1h: number | null;
        interactions24h: number | null;
        interactions7d: number | null;
      }
    | undefined,
  metric: "views" | "interactions",
  window: TrendWindow,
) {
  if (!trend) return null;
  if (metric === "views") {
    if (window === "1h") return trend.views1h;
    if (window === "24h") return trend.views24h;
    return trend.views7d;
  }

  if (window === "1h") return trend.interactions1h;
  if (window === "24h") return trend.interactions24h;
  return trend.interactions7d;
}

function trendClass(value: number | null) {
  if (value === null) return "text-slate-400";
  if (value > 0) return "text-rose-600";
  if (value < 0) return "text-emerald-600";
  return "text-slate-500";
}

function NumberValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-semibold tabular-nums text-slate-950", className)}>
      {children}
    </span>
  );
}

function TrendLine({
  label,
  value,
  missingLabel = "历史快照不足",
}: {
  label: string;
  value: number | null;
  missingLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs" title={value === null ? missingLabel : undefined}>
      <span className="w-10 text-slate-400">{label}</span>
      <span className={cn("font-semibold tabular-nums", trendClass(value))}>
        {formatSignedNumber(value)}
      </span>
    </div>
  );
}

function GrowthSpeedBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;

  const absValue = Math.max(0, value);
  const level =
    absValue >= 10_000
      ? {
          icon: "🔥",
          className: "bg-rose-100 text-rose-700",
        }
      : absValue >= 1_000
        ? {
            icon: "🚀",
            className: "bg-orange-100 text-orange-700",
          }
        : {
            icon: "↑",
            className: "bg-emerald-100 text-emerald-700",
          };

  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-0.5 rounded-md px-1.5 text-[11px] font-bold leading-none tabular-nums",
        level.className,
      )}
      title="1 小时播放增长速度"
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        {level.icon}
      </span>
      <span>{formatNumber(absValue)}/h</span>
    </span>
  );
}

export default async function ContentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim();
  const group = params.group?.trim() || "ALL";
  const creatorId = params.creatorId?.trim() || "ALL";
  const range = parseContentsRange(params.range?.trim());
  const requestedPage = parsePage(params.page?.trim());
  const pageSize = parsePageSize(params.pageSize?.trim());
  const sort = parseContentSort(params.sort?.trim());
  const order = parseSortOrder(params.order?.trim(), defaultContentSortOrder(sort));
  const trendWindow = parseTrendWindow(params.trendWindow?.trim());
  const now = new Date();
  const rangeStart = range === "month" ? businessDates(now).monthStart : new Date(now.getTime() - CONTENT_RANGE_DURATIONS[range]);
  const oneHourAgo = new Date(now.getTime() - HOUR_MS);
  const oneDayAgo = new Date(now.getTime() - DAY_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [contents, creators, groups] = await Promise.all([
    prisma.contentItem.findMany({
      where: {
        ...(q ? { title: { contains: q } } : {}),
        ...(creatorId !== "ALL" ? { creatorId } : {}),
        ...(group !== "ALL" ? { creator: { groupName: { in: await getGroupScope(group) } } } : {}),
        publishedAt: { gte: rangeStart, lte: now },
      },
      include: { creator: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.upCreator.findMany({
      select: { id: true, name: true, alias: true },
      orderBy: { name: "asc" },
    }),
    listCreatorGroups(),
  ]);
  const contentIds = contents.map((item) => item.id);
  const snapshots = contentIds.length
    ? await prisma.metricSnapshot.findMany({
        where: {
          contentId: { in: contentIds },
          capturedAt: { gte: new Date(now.getTime() - 8 * DAY_MS) },
        },
        select: {
          contentId: true,
          capturedAt: true,
          viewCount: true,
          danmakuCount: true,
          replyCount: true,
          favoriteCount: true,
          coinCount: true,
          shareCount: true,
          likeCount: true,
        },
        orderBy: { capturedAt: "desc" },
      })
    : [];
  const trendsByContentId = new Map(
    contents.map((item) => {
      const h1 = latestSnapshotNearBaseline(snapshots, item.id, oneHourAgo, HOUR_MS);
      const d1 = latestSnapshotNearBaseline(snapshots, item.id, oneDayAgo, 6 * HOUR_MS);
      const d7 = latestSnapshotNearBaseline(snapshots, item.id, sevenDaysAgo, DAY_MS);
      const currentInteraction = interactionTotal(item);

      return [
        item.id,
        {
          views1h: delta(item.viewCount, h1?.viewCount),
          views24h: delta(item.viewCount, d1?.viewCount),
          views7d: delta(item.viewCount, d7?.viewCount),
          interactionTotal: currentInteraction,
          interactions1h: h1 ? currentInteraction - interactionTotal(h1) : null,
          interactions24h: d1 ? currentInteraction - interactionTotal(d1) : null,
          interactions7d: d7 ? currentInteraction - interactionTotal(d7) : null,
        },
      ] as const;
    }),
  );
  const sortedContents = sort
    ? [...contents].sort((a, b) => {
        const trendA = trendsByContentId.get(a.id);
        const trendB = trendsByContentId.get(b.id);
        let result = 0;

        if (sort === "title") result = compareString(a.title, b.title, order);
        if (sort === "creatorName") result = compareString(creatorDisplayName(a.creator), creatorDisplayName(b.creator), order);
        if (sort === "groupName") result = compareString(a.creator.groupName, b.creator.groupName, order);
        if (sort === "viewCount") result = compareNumber(a.viewCount, b.viewCount, order);
        if (sort === "viewsTrend") {
          result = compareNullableNumber(
            trendSortValue(trendA, "views", trendWindow),
            trendSortValue(trendB, "views", trendWindow),
            order,
          );
        }
        if (sort === "interactionTotal") {
          result = compareNumber(trendA?.interactionTotal ?? 0, trendB?.interactionTotal ?? 0, order);
        }
        if (sort === "interactionsTrend") {
          result = compareNullableNumber(
            trendSortValue(trendA, "interactions", trendWindow),
            trendSortValue(trendB, "interactions", trendWindow),
            order,
          );
        }
        if (sort === "favoriteCount") result = compareNumber(a.favoriteCount, b.favoriteCount, order);
        if (sort === "publishedAt") result = compareNullableDate(a.publishedAt, b.publishedAt, order);
        if (sort === "lastFetchedAt") result = compareNullableDate(a.lastFetchedAt, b.lastFetchedAt, order);

        if (sort === "viewsTrend" || sort === "interactionsTrend") return result;
        return result || compareString(a.title, b.title, "asc");
      })
    : contents;
  const {
    items: paginatedContents,
    currentPage,
    total: contentTotal,
  } = paginateItems(sortedContents, requestedPage, pageSize);

  function sortHref(key: ContentSortKey, defaultOrder: SortOrder = "desc") {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    next.set("range", range);
    if (pageSize !== DEFAULT_PAGE_SIZE) next.set("pageSize", String(pageSize));
    if (group !== "ALL") next.set("group", group);
    if (creatorId !== "ALL") next.set("creatorId", creatorId);
    if (trendWindow !== "1h") next.set("trendWindow", trendWindow);
    next.set("sort", key);
    next.set("order", sort === key ? (order === "asc" ? "desc" : "asc") : defaultOrder);
    return `/contents?${next.toString()}`;
  }

  return (
    <div className="space-y-7">
      <section>
        <h1 className="text-2xl font-semibold tracking-normal">内容监控库</h1>
        <p className="mt-1 text-sm text-slate-500">聚合已监控 UP 的公开视频内容和基础互动指标</p>
      </section>

      <section>
        <ContentsFilters
          range={range}
          q={q}
          group={group}
          creatorId={creatorId}
          groups={groups}
          creators={creators.map(c=>({...c,name:creatorDisplayName(c)}))}
        />
      </section>

      <section className="rounded-lg border border-black/[0.055] bg-white shadow-none">
        <Table className="min-w-[1120px] table-fixed">
          <colgroup>
            <col className="w-[420px]" />
            <col className="w-[112px]" />
            <col className="w-[96px]" />
            <col className="w-[160px]" />
            <col className="w-[96px]" />
            <col className="w-[116px]" />
            <col className="w-[116px]" />
            <col className="w-[116px]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader href={sortHref("title", "asc")} active={sort === "title"} order={order}>
                  内容
                </SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader href={sortHref("viewCount")} active={sort === "viewCount"} order={order}>
                  播放量
                </SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader
                  href={sortHref("viewsTrend")}
                  active={sort === "viewsTrend"}
                  order={order}
                  title={`按 ${trendWindow} 播放增长排序`}
                >
                  播放趋势
                </SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader
                  href={sortHref("interactionTotal")}
                  active={sort === "interactionTotal"}
                  order={order}
                >
                  互动量
                </SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader
                  href={sortHref("interactionsTrend")}
                  active={sort === "interactionsTrend"}
                  order={order}
                  title={`按 ${trendWindow} 互动增长排序`}
                >
                  互动趋势
                </SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader href={sortHref("favoriteCount")} active={sort === "favoriteCount"} order={order}>
                  收藏/投币
                </SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader href={sortHref("publishedAt")} active={sort === "publishedAt"} order={order}>
                  发布时间
                </SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader href={sortHref("lastFetchedAt")} active={sort === "lastFetchedAt"} order={order}>
                  最近抓取
                </SortHeader>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedContents.length === 0 ? (
              <TableRow>
                <TableEmptyState colSpan={8}>
                  暂无内容数据。执行一次监控任务后会自动入库。
                </TableEmptyState>
              </TableRow>
            ) : (
              paginatedContents.map((item) => {
                const trend = trendsByContentId.get(item.id);
                const durationText = formatDurationFromSeconds(item.durationSeconds);

                return (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex items-center gap-3">
                        <a
                          href={biliVideoUrl(item.bvid)}
                          target="_blank"
                          rel="noreferrer"
                          className="relative block h-14 w-24 shrink-0 overflow-hidden rounded-md bg-slate-100"
                        >
                          {item.coverUrl ? (
                            <Image
                              src={item.coverUrl}
                              alt=""
                              width={96}
                              height={56}
                              className="h-full w-full object-cover transition-opacity hover:opacity-85"
                            />
                          ) : null}
                          {durationText ? (
                            <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[10px] leading-4 text-white">
                              {durationText}
                            </span>
                          ) : null}
                        </a>
                        <div className="min-w-0">
                          <a
                            href={biliVideoUrl(item.bvid)}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-2 max-w-[280px] whitespace-normal break-words font-medium leading-snug hover:text-[var(--app-primary)]"
                          >
                            {item.title}
                          </a>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            {item.creator.avatarUrl ? (
                              <Image
                                src={item.creator.avatarUrl}
                                alt=""
                                width={20}
                                height={20}
                                className="size-5 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-medium text-slate-600">
                                {creatorDisplayName(item.creator).slice(0, 1)}
                              </span>
                            )}
                            <span>{creatorDisplayName(item.creator)}</span>
                            <Badge variant="outline" className="bg-sky-50 text-sky-700">
                              {item.creator.groupName}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-2">
                        <NumberValue>{formatNumber(item.viewCount)}</NumberValue>
                        <GrowthSpeedBadge value={trend?.views1h} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <TrendLine label="1h" value={trend?.views1h ?? null} />
                        <TrendLine label="24h" value={trend?.views24h ?? null} />
                        <TrendLine label="7d" value={trend?.views7d ?? null} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <NumberValue>{formatNumber(trend?.interactionTotal ?? 0)}</NumberValue>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        赞{" "}
                        <NumberValue className="text-xs text-slate-700">
                          {formatNumber(item.likeCount)}
                        </NumberValue>{" "}
                        · 评{" "}
                        <NumberValue className="text-xs text-slate-700">
                          {formatNumber(item.replyCount)}
                        </NumberValue>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        弹幕{" "}
                        <NumberValue className="text-xs text-slate-700">
                          {formatNumber(item.danmakuCount)}
                        </NumberValue>{" "}
                        · 分享{" "}
                        <NumberValue className="text-xs text-slate-700">
                          {formatNumber(item.shareCount)}
                        </NumberValue>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <TrendLine label="1h" value={trend?.interactions1h ?? null} />
                        <TrendLine label="24h" value={trend?.interactions24h ?? null} />
                        <TrendLine label="7d" value={trend?.interactions7d ?? null} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <span className="text-slate-400">收藏</span>{" "}
                        <NumberValue className="text-xs text-slate-700">
                          {formatNumber(item.favoriteCount)}
                        </NumberValue>
                      </div>
                      <div className="mt-1 text-xs">
                        <span className="text-slate-400">投币</span>{" "}
                        <NumberValue className="text-xs text-slate-700">
                          {formatNumber(item.coinCount)}
                        </NumberValue>
                      </div>
                    </TableCell>
                    <TableCell>
                      <time
                        dateTime={item.publishedAt?.toISOString()}
                        title={formatFullDateTime(item.publishedAt)}
                        className="block"
                      >
                        <span className="block text-sm font-medium text-slate-900">
                          {formatReadablePublishTime(item.publishedAt, now)}
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {formatDate(item.publishedAt)}
                        </span>
                      </time>
                    </TableCell>
                    <TableCell>{formatDateTime(item.lastFetchedAt)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination total={contentTotal} page={currentPage} pageSize={pageSize} />
      </section>
    </div>
  );
}

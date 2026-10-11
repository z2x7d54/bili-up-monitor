import { CreatorNoteRow } from "@/components/creator-note-row";
import { creatorDisplayName } from "@/lib/creator-personal";
import { getMonthlyReport } from "@/lib/monthly-report";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ColumnResizeHandle } from "@/components/column-resize-handle";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GroupManager } from "@/components/group-manager";
import { SortHeader } from "@/components/sort-header";
import { TableEmptyState } from "@/components/table-empty-state";
import { TablePagination } from "@/components/table-pagination";
import { UpCreateForm } from "@/components/up-create-form";
import { UpRowActions } from "@/components/up-row-actions";
import { UpStatusFilter } from "@/components/up-status-filter";
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
import { formatDateTime, formatNumber, formatSignedNumber, statusLabel } from "@/lib/view-format";

type PageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const columnWidths = {
  name: "var(--ups-name-col-width, 220px)",
  followers: "var(--ups-followers-col-width, 100px)",
  followerTrend: "var(--ups-follower-trend-col-width, 124px)",
  views: "var(--ups-views-col-width, 108px)",
  viewTrend: "var(--ups-view-trend-col-width, 124px)",
  likes: "var(--ups-likes-col-width, 100px)",
  likeTrend: "var(--ups-like-trend-col-width, 112px)",
  videos: "var(--ups-videos-col-width, 110px)",
  posts: "var(--ups-posts-col-width, 110px)",
  created: "var(--ups-created-col-width, 118px)",
  updated: "var(--ups-updated-col-width, 118px)",
  status: "var(--ups-status-col-width, 118px)",
  actions: "var(--ups-actions-col-width, 256px)",
} as const;
const nameColumnStyle = {
  width: columnWidths.name,
  minWidth: columnWidths.name,
  maxWidth: columnWidths.name,
};
const actionsColumnStyle = {
  width: columnWidths.actions,
  minWidth: columnWidths.actions,
  maxWidth: columnWidths.actions,
};

type CreatorSnapshot = {
  creatorId: string | null;
  capturedAt: Date;
  followerCount: number | null;
  likeCount: number | null;
};

type ContentViewSnapshot = {
  contentId: string | null;
  capturedAt: Date;
  viewCount: number | null;
};

type ContentViewItem = {
  id: string;
  creatorId: string;
  viewCount: number;
};

type UpSortKey =
  | "name"
  | "groupName"
  | "followerCount"
  | "followersTrend"
  | "followers1h"
  | "followers24h"
  | "followers7d"
  | "viewCount"
  | "viewsTrend"
  | "views1h"
  | "views24h"
  | "views7d"
  | "likeCount"
  | "likesTrend"
  | "likes1h"
  | "likes24h"
  | "likes7d"
  | "videoCount"
  | "postsToday"
  | "postsMonth"
  | "lastPublishedAt"
  | "posts1h"
  | "posts24h"
  | "posts7d"
  | "createdAt"
  | "lastFetchedAt"
  | "status";

const UP_SORT_KEYS = new Set<UpSortKey>([
  "name",
  "groupName",
  "followerCount",
  "followersTrend",
  "followers1h",
  "followers24h",
  "followers7d",
  "viewCount",
  "viewsTrend",
  "views1h",
  "views24h",
  "views7d",
  "likeCount",
  "likesTrend",
  "likes1h",
  "likes24h",
  "likes7d",
  "videoCount",
  "postsToday",
  "postsMonth",
  "lastPublishedAt",
  "posts1h",
  "posts24h",
  "posts7d",
  "createdAt",
  "lastFetchedAt",
  "status",
]);

function parseUpSort(value: string | undefined) {
  return value && UP_SORT_KEYS.has(value as UpSortKey) ? (value as UpSortKey) : null;
}

function defaultUpSortOrder(sort: UpSortKey | null): SortOrder {
  return sort === "name" || sort === "groupName" || sort === "status" ? "asc" : "desc";
}

function statusClass(status: string) {
  if (status === "MONITORING") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "ERROR") return "bg-rose-50 text-rose-700 border-rose-200";
  return "border-slate-100 bg-slate-100 text-slate-600";
}

function statusDotClass(status: string) {
  if (status === "MONITORING") return "bg-emerald-500";
  if (status === "ERROR") return "bg-rose-500";
  return "bg-slate-400";
}

function latestSnapshotAtOrBefore(
  snapshots: CreatorSnapshot[],
  creatorId: string,
  cutoff: Date,
) {
  return snapshots.find(
    (snapshot) =>
      snapshot.creatorId === creatorId && snapshot.capturedAt.getTime() <= cutoff.getTime(),
  );
}

function latestContentSnapshotAtOrBefore(
  snapshotsByContentId: Map<string, ContentViewSnapshot[]>,
  contentId: string,
  cutoff: Date,
) {
  const snapshots = snapshotsByContentId.get(contentId) ?? [];
  return snapshots.find(
    (snapshot) =>
      snapshot.contentId === contentId && snapshot.capturedAt.getTime() <= cutoff.getTime(),
  );
}

function delta(current: number, baseline: number | null | undefined) {
  if (baseline === null || baseline === undefined) return null;
  return current - baseline;
}

function trendSortPriority(
  oneHour: number | null | undefined,
  oneDay: number | null | undefined,
  sevenDays: number | null | undefined,
) {
  if (oneHour !== null && oneHour !== undefined) return { rank: 0, value: oneHour };
  if (oneDay !== null && oneDay !== undefined) return { rank: 1, value: oneDay };
  if (sevenDays !== null && sevenDays !== undefined) return { rank: 2, value: sevenDays };
  return { rank: 3, value: null };
}

function compareTrendPriority(
  a: ReturnType<typeof trendSortPriority>,
  b: ReturnType<typeof trendSortPriority>,
  order: SortOrder,
) {
  const rankResult = a.rank - b.rank;
  if (rankResult !== 0) return rankResult;
  return compareNullableNumber(a.value, b.value, order);
}

function sumContentViews(items: ContentViewItem[]) {
  return items.reduce((total, item) => total + item.viewCount, 0);
}

function contentViewDelta(
  items: ContentViewItem[],
  snapshotsByContentId: Map<string, ContentViewSnapshot[]>,
  cutoff: Date,
) {
  let total = 0;
  let knownCount = 0;

  for (const item of items) {
    const baseline = latestContentSnapshotAtOrBefore(snapshotsByContentId, item.id, cutoff)?.viewCount;
    if (baseline === null || baseline === undefined) continue;
    total += item.viewCount - baseline;
    knownCount += 1;
  }

  return knownCount > 0 ? total : null;
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

function CountLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs" title="按本地内容库发布时间统计">
      <span className="w-10 text-slate-400">{label}</span>
      <span className="font-semibold tabular-nums text-slate-600">{formatSignedNumber(value)}</span>
    </div>
  );
}

export default async function UpsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim();
  const group = params.group?.trim();
  const status = params.status?.trim();
  const sort = parseUpSort(params.sort?.trim());
  const order = parseSortOrder(params.order?.trim(), defaultUpSortOrder(sort));
  const requestedPage = parsePage(params.page?.trim());
  const pageSize = parsePageSize(params.pageSize?.trim());
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - HOUR_MS);
  const oneDayAgo = new Date(now.getTime() - DAY_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);

  const creatorWhere = {
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { alias: { contains: q } },
            { note: { contains: q } },
            { mid: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
    ...(group && group !== "ALL" ? { groupName: { in: await getGroupScope(group) } } : {}),
  };
  const filteredCreatorWhere = {
    ...creatorWhere,
    ...(status && status !== "ALL" ? { status } : {}),
  };

  const [creatorRows, groups, totalCount, statusCountGroups] = await Promise.all([
    prisma.upCreator.findMany({
      where: filteredCreatorWhere,
      include: { _count: { select: { contents: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    listCreatorGroups(),
    prisma.upCreator.count(),
    prisma.upCreator.groupBy({
      by: ["status"],
      where: creatorWhere,
      _count: { _all: true },
    }),
  ]);
  const creators = creatorRows.map(creator => ({ ...creator, biliName:creator.name, name:creatorDisplayName(creator) }));
  const statusCounts = {
    all: statusCountGroups.reduce((total, item) => total + item._count._all, 0),
    monitoring: statusCountGroups.find((item) => item.status === "MONITORING")?._count._all ?? 0,
    paused: statusCountGroups.find((item) => item.status === "PAUSED")?._count._all ?? 0,
    error: statusCountGroups.find((item) => item.status === "ERROR")?._count._all ?? 0,
  };
  const creatorIds = creators.map((creator) => creator.id);
  const [snapshots, contentItems, contentViewSnapshots, recentPosts1h, recentPosts24h, recentPosts7d] = creatorIds.length
    ? await Promise.all([
        prisma.metricSnapshot.findMany({
          where: {
            creatorId: { in: creatorIds },
            capturedAt: { gte: new Date(now.getTime() - 8 * DAY_MS) },
          },
          select: {
            creatorId: true,
            capturedAt: true,
            followerCount: true,
            likeCount: true,
          },
          orderBy: { capturedAt: "desc" },
        }),
        prisma.contentItem.findMany({
          where: {
            creatorId: { in: creatorIds },
          },
          select: {
            id: true,
            creatorId: true,
            viewCount: true,
          },
        }),
        prisma.metricSnapshot.findMany({
          where: {
            contentId: { not: null },
            content: {
              creatorId: { in: creatorIds },
            },
            capturedAt: { gte: new Date(now.getTime() - 8 * DAY_MS) },
          },
          select: {
            contentId: true,
            capturedAt: true,
            viewCount: true,
          },
          orderBy: { capturedAt: "desc" },
        }),
        prisma.contentItem.groupBy({
          by: ["creatorId"],
          where: {
            creatorId: { in: creatorIds },
            publishedAt: { gte: oneHourAgo },
          },
          _count: { _all: true },
        }),
        prisma.contentItem.groupBy({
          by: ["creatorId"],
          where: {
            creatorId: { in: creatorIds },
            publishedAt: { gte: oneDayAgo },
          },
          _count: { _all: true },
        }),
        prisma.contentItem.groupBy({
          by: ["creatorId"],
          where: {
            creatorId: { in: creatorIds },
            publishedAt: { gte: sevenDaysAgo },
          },
          _count: { _all: true },
        }),
      ])
    : [[], [], [], [], [], []];
  const contentItemsByCreatorId = new Map<string, ContentViewItem[]>();
  for (const item of contentItems) {
    const list = contentItemsByCreatorId.get(item.creatorId) ?? [];
    list.push(item);
    contentItemsByCreatorId.set(item.creatorId, list);
  }
  const contentViewSnapshotsByContentId = new Map<string, ContentViewSnapshot[]>();
  for (const snapshot of contentViewSnapshots) {
    if (!snapshot.contentId) continue;
    const list = contentViewSnapshotsByContentId.get(snapshot.contentId) ?? [];
    list.push(snapshot);
    contentViewSnapshotsByContentId.set(snapshot.contentId, list);
  }
  const posts1hByCreatorId = new Map(
    recentPosts1h.map((item) => [item.creatorId, item._count._all]),
  );
  const posts24hByCreatorId = new Map(
    recentPosts24h.map((item) => [item.creatorId, item._count._all]),
  );
  const posts7dByCreatorId = new Map(
    recentPosts7d.map((item) => [item.creatorId, item._count._all]),
  );
  const monthly = await getMonthlyReport({ now });
  const monthlyByCreator = new Map(monthly.accounts.map(account => [account.id, account]));
  const trendsByCreatorId = new Map(
    creators.map((creator) => {
      const h1 = latestSnapshotAtOrBefore(snapshots, creator.id, oneHourAgo);
      const d1 = latestSnapshotAtOrBefore(snapshots, creator.id, oneDayAgo);
      const d7 = latestSnapshotAtOrBefore(snapshots, creator.id, sevenDaysAgo);
      const creatorContentItems = contentItemsByCreatorId.get(creator.id) ?? [];

      return [
        creator.id,
        {
          followers1h: delta(creator.followerCount, h1?.followerCount),
          followers24h: delta(creator.followerCount, d1?.followerCount),
          followers7d: delta(creator.followerCount, d7?.followerCount),
          viewTotal: sumContentViews(creatorContentItems),
          views1h: contentViewDelta(creatorContentItems, contentViewSnapshotsByContentId, oneHourAgo),
          views24h: contentViewDelta(creatorContentItems, contentViewSnapshotsByContentId, oneDayAgo),
          views7d: contentViewDelta(creatorContentItems, contentViewSnapshotsByContentId, sevenDaysAgo),
          likes1h: delta(creator.likeCount, h1?.likeCount),
          likes24h: delta(creator.likeCount, d1?.likeCount),
          likes7d: delta(creator.likeCount, d7?.likeCount),
          posts1h: posts1hByCreatorId.get(creator.id) ?? 0,
          posts24h: posts24hByCreatorId.get(creator.id) ?? 0,
          posts7d: posts7dByCreatorId.get(creator.id) ?? 0,
        },
      ] as const;
    }),
  );
  const sortedCreators = sort
    ? [...creators].sort((a, b) => {
        const trendA = trendsByCreatorId.get(a.id);
        const trendB = trendsByCreatorId.get(b.id);
        let result = 0;

        if (sort === "name") result = compareString(a.name, b.name, order);
        if (sort === "groupName") result = compareString(a.groupName, b.groupName, order);
        if (sort === "followerCount") result = compareNumber(a.followerCount, b.followerCount, order);
        if (sort === "followersTrend") {
          result = compareTrendPriority(
            trendSortPriority(trendA?.followers1h, trendA?.followers24h, trendA?.followers7d),
            trendSortPriority(trendB?.followers1h, trendB?.followers24h, trendB?.followers7d),
            order,
          );
        }
        if (sort === "followers1h") {
          result = compareNullableNumber(trendA?.followers1h, trendB?.followers1h, order);
        }
        if (sort === "followers24h") {
          result = compareNullableNumber(trendA?.followers24h, trendB?.followers24h, order);
        }
        if (sort === "followers7d") {
          result = compareNullableNumber(trendA?.followers7d, trendB?.followers7d, order);
        }
        if (sort === "viewCount") {
          result = compareNumber(trendA?.viewTotal ?? a.viewCount, trendB?.viewTotal ?? b.viewCount, order);
        }
        if (sort === "viewsTrend") {
          result = compareTrendPriority(
            trendSortPriority(trendA?.views1h, trendA?.views24h, trendA?.views7d),
            trendSortPriority(trendB?.views1h, trendB?.views24h, trendB?.views7d),
            order,
          );
        }
        if (sort === "views1h") result = compareNullableNumber(trendA?.views1h, trendB?.views1h, order);
        if (sort === "views24h") result = compareNullableNumber(trendA?.views24h, trendB?.views24h, order);
        if (sort === "views7d") result = compareNullableNumber(trendA?.views7d, trendB?.views7d, order);
        if (sort === "likeCount") result = compareNumber(a.likeCount, b.likeCount, order);
        if (sort === "likesTrend") {
          result = compareTrendPriority(
            trendSortPriority(trendA?.likes1h, trendA?.likes24h, trendA?.likes7d),
            trendSortPriority(trendB?.likes1h, trendB?.likes24h, trendB?.likes7d),
            order,
          );
        }
        if (sort === "likes1h") result = compareNullableNumber(trendA?.likes1h, trendB?.likes1h, order);
        if (sort === "likes24h") result = compareNullableNumber(trendA?.likes24h, trendB?.likes24h, order);
        if (sort === "likes7d") result = compareNullableNumber(trendA?.likes7d, trendB?.likes7d, order);
        if (sort === "videoCount") result = compareNumber(a.videoCount, b.videoCount, order);
        if (sort === "postsToday") result = compareNumber(monthlyByCreator.get(a.id)?.todayCount ?? 0, monthlyByCreator.get(b.id)?.todayCount ?? 0, order);
        if (sort === "postsMonth") result = compareNumber(monthlyByCreator.get(a.id)?.monthCount ?? 0, monthlyByCreator.get(b.id)?.monthCount ?? 0, order);
        if (sort === "lastPublishedAt") result = compareNullableDate(monthlyByCreator.get(a.id)?.lastPublishedAt, monthlyByCreator.get(b.id)?.lastPublishedAt, order);
        if (sort === "posts1h") result = compareNumber(trendA?.posts1h ?? 0, trendB?.posts1h ?? 0, order);
        if (sort === "posts24h") result = compareNumber(trendA?.posts24h ?? 0, trendB?.posts24h ?? 0, order);
        if (sort === "posts7d") result = compareNumber(trendA?.posts7d ?? 0, trendB?.posts7d ?? 0, order);
        if (sort === "createdAt") result = compareNullableDate(a.createdAt, b.createdAt, order);
        if (sort === "lastFetchedAt") result = compareNullableDate(a.lastFetchedAt, b.lastFetchedAt, order);
        if (sort === "status") result = compareString(statusLabel(a.status), statusLabel(b.status), order);

        return result || compareString(a.name, b.name, "asc");
      })
    : creators;
  const {
    items: paginatedCreators,
    currentPage,
    total: creatorTotal,
  } = paginateItems(sortedCreators, requestedPage, pageSize);
  const normalizedGroups = groups.map((item) => ({
    name: item.path,
    value: item.name,
    count: item.totalCount,
  }));
  const activeGroup = group || "ALL";
  const activeGroupExists =
    activeGroup === "ALL" || normalizedGroups.some((item) => item.value === activeGroup);

  function groupHref(value: string) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status && status !== "ALL") next.set("status", status);
    if (pageSize !== DEFAULT_PAGE_SIZE) next.set("pageSize", String(pageSize));
    if (sort) {
      next.set("sort", sort);
      next.set("order", order);
    }
    if (value !== "ALL") next.set("group", value);
    const query = next.toString();
    return query ? `/ups?${query}` : "/ups";
  }

  function sortHref(key: UpSortKey, defaultOrder: SortOrder = "desc", isActive = sort === key) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (activeGroup !== "ALL") next.set("group", activeGroup);
    if (status && status !== "ALL") next.set("status", status);
    if (pageSize !== DEFAULT_PAGE_SIZE) next.set("pageSize", String(pageSize));
    next.set("sort", key);
    next.set("order", isActive ? (order === "asc" ? "desc" : "asc") : defaultOrder);
    const query = next.toString();
    return `/ups?${query}`;
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">UP 主监控库</h1>
            <p className="mt-1 text-sm text-slate-500">管理和监控关注的 B 站 UP 主</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UpCreateForm groups={groups.map(item => ({ name:item.name,path:item.path }))} />
            <GroupManager groups={groups} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-black/[0.055] bg-white shadow-none">
        <form className="flex flex-wrap items-center gap-3 border-b border-black/[0.045] p-4">
          <div className="relative w-[260px] max-w-full shrink-0">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="名称、备注或 UID" className="rounded-md border-black/[0.06] bg-white pl-8 shadow-none" />
          </div>
          {activeGroup !== "ALL" ? <input type="hidden" name="group" value={activeGroup} /> : null}
          {sort ? <input type="hidden" name="sort" value={sort} /> : null}
          {sort ? <input type="hidden" name="order" value={order} /> : null}
          {pageSize !== DEFAULT_PAGE_SIZE ? <input type="hidden" name="pageSize" value={pageSize} /> : null}
          <div className="min-w-[260px] flex-1">
            <div className="flex items-center gap-1 overflow-x-auto">
              <Link
                href={groupHref("ALL")}
                className={[
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-3 text-sm transition",
                  activeGroup === "ALL"
                    ? "border-black/[0.055] bg-muted/70 text-slate-950"
                    : "text-slate-600 hover:bg-muted/70 hover:text-slate-950",
                ].join(" ")}
              >
                全部
                <span className="text-xs text-slate-400">{totalCount}</span>
              </Link>
              {normalizedGroups.map((item) => (
                <Link
                  key={item.value}
                  href={groupHref(item.value)}
                  className={[
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-3 text-sm transition",
                    activeGroup === item.value
                      ? "border-black/[0.055] bg-muted/70 text-slate-950"
                      : "text-slate-600 hover:bg-muted/70 hover:text-slate-950",
                  ].join(" ")}
                  title={`${item.name} (${item.count})`}
                >
                  <span className="max-w-28 truncate">{item.name}</span>
                  <span className="text-xs text-slate-400">{item.count}</span>
                </Link>
              ))}
              {!activeGroupExists ? (
                <Link
                  href={groupHref(activeGroup)}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-black/[0.055] bg-muted/70 px-3 text-sm text-slate-950"
                  title={activeGroup}
                >
                  <span className="max-w-28 truncate">{activeGroup}</span>
                  <span className="text-xs text-slate-400">0</span>
                </Link>
              ) : null}
            </div>
          </div>
          <div className="ml-auto flex shrink-0">
            <UpStatusFilter
              q={q}
              group={activeGroup}
              status={status}
              sort={sort ?? undefined}
              order={sort ? order : undefined}
              pageSize={pageSize}
              counts={statusCounts}
            />
          </div>
        </form>

        <Table className="min-w-[2000px] [&_td:last-child]:px-2 [&_th:last-child]:px-2">
          <colgroup>
            <col style={{ width: columnWidths.name }} />
            <col style={{ width: columnWidths.followers }} />
            <col style={{ width: columnWidths.followerTrend }} />
            <col style={{ width: columnWidths.views }} />
            <col style={{ width: columnWidths.viewTrend }} />
            <col style={{ width: columnWidths.likes }} />
            <col style={{ width: columnWidths.likeTrend }} />
            <col style={{ width: columnWidths.videos }} />
            <col style={{ width: columnWidths.posts }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: columnWidths.created }} />
            <col style={{ width: columnWidths.updated }} />
            <col style={{ width: columnWidths.status }} />
            <col style={{ width: columnWidths.actions }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead
                className="sticky left-0 z-20 bg-muted/70 shadow-[1px_0_0_rgba(15,23,42,0.06)]"
                style={nameColumnStyle}
              >
                <SortHeader href={sortHref("name", "asc")} active={sort === "name"} order={order}>
                  UP 主
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-name-col-width" defaultWidth={220} minWidth={180} maxWidth={360} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader href={sortHref("followerCount")} active={sort === "followerCount"} order={order}>
                  粉丝数
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-followers-col-width" defaultWidth={100} minWidth={80} maxWidth={180} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader
                  href={sortHref(
                    "followersTrend",
                    "desc",
                    sort === "followersTrend" ||
                      sort === "followers1h" ||
                      sort === "followers24h" ||
                      sort === "followers7d",
                  )}
                  active={
                    sort === "followersTrend" ||
                    sort === "followers1h" ||
                    sort === "followers24h" ||
                    sort === "followers7d"
                  }
                  order={order}
                  title="排序优先级：1h，其次 24h，再其次 7d"
                >
                  涨粉趋势
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-follower-trend-col-width" defaultWidth={124} minWidth={100} maxWidth={220} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader href={sortHref("viewCount")} active={sort === "viewCount"} order={order}>
                  播放量
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-views-col-width" defaultWidth={108} minWidth={88} maxWidth={190} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader
                  href={sortHref(
                    "viewsTrend",
                    "desc",
                    sort === "viewsTrend" || sort === "views1h" || sort === "views24h" || sort === "views7d",
                  )}
                  active={sort === "viewsTrend" || sort === "views1h" || sort === "views24h" || sort === "views7d"}
                  order={order}
                  title="排序优先级：1h，其次 24h，再其次 7d"
                >
                  播放趋势
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-view-trend-col-width" defaultWidth={124} minWidth={100} maxWidth={220} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader href={sortHref("likeCount")} active={sort === "likeCount"} order={order}>
                  获赞数
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-likes-col-width" defaultWidth={100} minWidth={80} maxWidth={180} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader
                  href={sortHref(
                    "likesTrend",
                    "desc",
                    sort === "likesTrend" || sort === "likes1h" || sort === "likes24h" || sort === "likes7d",
                  )}
                  active={sort === "likesTrend" || sort === "likes1h" || sort === "likes24h" || sort === "likes7d"}
                  order={order}
                  title="排序优先级：1h，其次 24h，再其次 7d"
                >
                  获赞趋势
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-like-trend-col-width" defaultWidth={112} minWidth={100} maxWidth={220} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader href={sortHref("videoCount")} active={sort === "videoCount"} order={order}>
                  投稿/入库
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-videos-col-width" defaultWidth={110} minWidth={90} maxWidth={190} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader
                  href={sortHref("posts24h")}
                  active={sort === "posts1h" || sort === "posts24h" || sort === "posts7d"}
                  order={order}
                  title="默认按 24h 新增投稿排序"
                >
                  新增投稿
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-posts-col-width" defaultWidth={110} minWidth={90} maxWidth={190} />
              </TableHead>
              <TableHead><SortHeader href={sortHref("postsToday")} active={sort === "postsToday"} order={order}>今天投稿</SortHeader></TableHead>
              <TableHead><SortHeader href={sortHref("postsMonth")} active={sort === "postsMonth"} order={order}>本月投稿</SortHeader></TableHead>
              <TableHead><SortHeader href={sortHref("lastPublishedAt", "asc")} active={sort === "lastPublishedAt"} order={order}>最后投稿</SortHeader></TableHead>
              <TableHead className="relative">
                <SortHeader href={sortHref("createdAt")} active={sort === "createdAt"} order={order}>
                  入库时间
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-created-col-width" defaultWidth={118} minWidth={100} maxWidth={220} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader href={sortHref("lastFetchedAt")} active={sort === "lastFetchedAt"} order={order}>
                  最近更新
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-updated-col-width" defaultWidth={118} minWidth={100} maxWidth={220} />
              </TableHead>
              <TableHead className="relative">
                <SortHeader href={sortHref("status", "asc")} active={sort === "status"} order={order}>
                  状态
                </SortHeader>
                <ColumnResizeHandle cssVar="--ups-status-col-width" defaultWidth={118} minWidth={92} maxWidth={200} />
              </TableHead>
              <TableHead
                className="sticky right-0 z-20 bg-muted/70 text-center shadow-[-1px_0_0_rgba(15,23,42,0.06)]"
                style={actionsColumnStyle}
              >
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCreators.length === 0 ? (
              <TableRow>
                <TableEmptyState colSpan={16}>
                  暂无 UP 主。点击右上角「+添加 UP 主」即可开始监控。
                </TableEmptyState>
              </TableRow>
            ) : (
              paginatedCreators.map((creator) => {
                const trend = trendsByCreatorId.get(creator.id);

                return (
                  <CreatorNoteRow key={creator.id}>
                    <TableCell
                      className={cn(
                        "sticky left-0 z-10 shadow-[1px_0_0_rgba(15,23,42,0.06)]",
                        "bg-white group-hover/row:bg-slate-50",
                      )}
                      style={nameColumnStyle}
                    >
                      <div className="flex items-center gap-3">
                        {creator.avatarUrl ? (
                          <Image
                            src={creator.avatarUrl}
                            alt=""
                            width={44}
                            height={44}
                            className="size-11 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-sm font-medium">
                            {creator.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              className={cn("size-2 shrink-0 rounded-full", statusDotClass(creator.status))}
                              title={statusLabel(creator.status)}
                            />
                            <div className="truncate font-medium" title={creator.name}>{creator.name}</div>
                          </div>
                          {creator.alias && <div className="mt-1 truncate text-xs text-slate-400" title={creator.biliName}>B站：{creator.biliName}</div>}
                          {creator.note && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs text-amber-800" title={creator.note}>备注：{creator.note}</p>}
                          <div className="mt-1">
                            <Badge variant="outline" className="bg-sky-50 text-sky-700">
                              {creator.groupName}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <NumberValue>{formatNumber(creator.followerCount)}</NumberValue>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <TrendLine label="1h" value={trend?.followers1h ?? null} />
                        <TrendLine label="24h" value={trend?.followers24h ?? null} />
                        <TrendLine label="7d" value={trend?.followers7d ?? null} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <NumberValue>{formatNumber(trend?.viewTotal ?? creator.viewCount)}</NumberValue>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <TrendLine label="1h" value={trend?.views1h ?? null} />
                        <TrendLine label="24h" value={trend?.views24h ?? null} />
                        <TrendLine label="7d" value={trend?.views7d ?? null} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <NumberValue>{formatNumber(creator.likeCount)}</NumberValue>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <TrendLine label="1h" value={trend?.likes1h ?? null} />
                        <TrendLine label="24h" value={trend?.likes24h ?? null} />
                        <TrendLine label="7d" value={trend?.likes7d ?? null} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <NumberValue>{formatNumber(creator.videoCount)}</NumberValue>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        入库{" "}
                        <NumberValue className="text-xs text-slate-700">
                          {formatNumber(creator._count.contents)}
                        </NumberValue>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <CountLine label="1h" value={trend?.posts1h ?? 0} />
                        <CountLine label="24h" value={trend?.posts24h ?? 0} />
                        <CountLine label="7d" value={trend?.posts7d ?? 0} />
                      </div>
                    </TableCell>
                    <TableCell>{monthlyByCreator.get(creator.id)?.todayCount ?? 0} 条</TableCell>
                    <TableCell>{monthlyByCreator.get(creator.id)?.monthCount ?? 0} 条</TableCell>
                    <TableCell>
                      {formatDateTime(monthlyByCreator.get(creator.id)?.lastPublishedAt)}
                      <div className="mt-1 text-xs text-slate-500">{monthlyByCreator.get(creator.id)?.complete ? ((monthlyByCreator.get(creator.id)?.days ?? 0) >= 7 ? "连续多天未投稿" : "已核对本月数据") : "数据待补齐"}</div>
                    </TableCell>
                    <TableCell>{formatDateTime(creator.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(creator.lastFetchedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass(creator.status)}>
                        {statusLabel(creator.status)}
                      </Badge>
                      {creator.lastError ? (
                        <div className="mt-1 max-w-56 truncate text-xs text-rose-600">{creator.lastError}</div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "sticky right-0 z-10 text-center shadow-[-1px_0_0_rgba(15,23,42,0.06)]",
                        "bg-white group-hover/row:bg-slate-50",
                      )}
                      style={actionsColumnStyle}
                    >
                      <UpRowActions
                        id={creator.id}
                        status={creator.status}
                        name={creator.biliName}
                        alias={creator.alias}
                        note={creator.note}
                        groupName={creator.groupName}
                        groups={groups.map(item => ({ name:item.name,path:item.path }))}
                      />
                    </TableCell>
                  </CreatorNoteRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination total={creatorTotal} page={currentPage} pageSize={pageSize} />
      </section>
    </div>
  );
}

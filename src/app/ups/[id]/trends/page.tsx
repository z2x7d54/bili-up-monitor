import { creatorDisplayName } from "@/lib/creator-personal";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { clampPage, pageOffset, parsePage, parsePageSize } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatFullDateTime,
  formatNumber,
  formatSignedNumber,
  statusLabel,
} from "@/lib/view-format";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

type CreatorTrendSnapshot = {
  capturedAt: Date;
  followerCount: number | null;
  viewCount: number | null;
  likeCount: number | null;
  videoCount: number | null;
};

type ContentViewItem = {
  id: string;
  viewCount: number;
};

type ContentViewSnapshot = {
  contentId: string | null;
  capturedAt: Date;
  viewCount: number | null;
};

type MetricKey = "followerCount" | "viewCount" | "likeCount" | "videoCount";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const dynamic = "force-dynamic";

function trendClass(value: number | null | undefined) {
  if (value === null || value === undefined) return "text-slate-400";
  if (value > 0) return "text-rose-600";
  if (value < 0) return "text-emerald-600";
  return "text-slate-500";
}

function statusTextClass(status: string) {
  if (status === "MONITORING") return "text-emerald-500";
  if (status === "ERROR") return "text-rose-700";
  if (status === "PAUSED") return "text-slate-500";
  return "text-slate-600";
}

function statusDotClass(status: string) {
  if (status === "MONITORING") return "bg-emerald-500";
  if (status === "ERROR") return "bg-rose-500";
  if (status === "PAUSED") return "bg-slate-400";
  return "bg-slate-400";
}

function formatExactMaybeNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : new Intl.NumberFormat("zh-CN").format(value);
}

function formatSignedExactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  if (value === 0) return "0";
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${new Intl.NumberFormat("zh-CN").format(Math.abs(value))}`;
}

function delta(current: number | null | undefined, baseline: number | null | undefined) {
  if (current === null || current === undefined || baseline === null || baseline === undefined) {
    return null;
  }
  return current - baseline;
}

function latestSnapshotAtOrBefore(
  snapshots: CreatorTrendSnapshot[],
  cutoff: Date,
) {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (snapshots[index].capturedAt.getTime() <= cutoff.getTime()) {
      return snapshots[index];
    }
  }
  return null;
}

function metricDelta(
  current: number,
  snapshots: CreatorTrendSnapshot[],
  key: MetricKey,
  cutoff: Date,
) {
  return delta(current, latestSnapshotAtOrBefore(snapshots, cutoff)?.[key]);
}

function metricValues(snapshots: CreatorTrendSnapshot[], key: MetricKey) {
  return snapshots
    .map((snapshot) => snapshot[key])
    .filter((value): value is number => typeof value === "number");
}

function sumContentViews(items: ContentViewItem[]) {
  return items.reduce((total, item) => total + item.viewCount, 0);
}

function latestContentSnapshotAtOrBefore(
  snapshotsByContentId: Map<string, ContentViewSnapshot[]>,
  contentId: string,
  cutoff: Date,
) {
  const snapshots = snapshotsByContentId.get(contentId) ?? [];
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (snapshots[index].capturedAt.getTime() <= cutoff.getTime()) {
      return snapshots[index];
    }
  }
  return null;
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

function aggregateContentViewValues(snapshots: ContentViewSnapshot[], currentTotal: number) {
  const buckets = new Map<number, number>();

  for (const snapshot of snapshots) {
    if (snapshot.viewCount === null || snapshot.viewCount === undefined) continue;
    const bucket = Math.floor(snapshot.capturedAt.getTime() / 60_000) * 60_000;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + snapshot.viewCount);
  }

  const values = [...buckets.entries()]
    .sort(([timeA], [timeB]) => timeA - timeB)
    .map(([, value]) => value);
  const lastValue = values.at(-1);
  if (lastValue !== currentTotal) values.push(currentTotal);
  return values;
}

function snapshotDelta(
  current: CreatorTrendSnapshot,
  previous: CreatorTrendSnapshot | undefined,
  key: MetricKey,
) {
  return delta(current[key], previous?.[key]);
}

function NumberValue({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold tabular-nums text-slate-950">{children}</span>;
}

function TrendValue({ value }: { value: number | null }) {
  return (
    <span className={cn("font-semibold tabular-nums", trendClass(value))}>
      {formatSignedNumber(value)}
    </span>
  );
}

function SnapshotTrendValue({ value }: { value: number | null }) {
  return (
    <span className={cn("font-semibold tabular-nums", trendClass(value))}>
      {formatSignedExactNumber(value)}
    </span>
  );
}

function MetricSparkline({
  values,
}: {
  values: number[];
}) {
  if (values.length < 2) {
    return (
      <div className="flex h-16 items-center rounded-md bg-slate-50 px-3 text-xs text-slate-400">
        快照不足，执行几次同步后会形成趋势线
      </div>
    );
  }

  const width = 240;
  const height = 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: height - ((value - min) / range) * height,
  }));
  const pointString = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const lastPoint = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full overflow-visible">
      <polyline
        points={pointString}
        fill="none"
        stroke="var(--app-primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill="var(--app-primary)" />
    </svg>
  );
}

function MetricPanel({
  title,
  value,
  deltas,
  sparklineValues,
}: {
  title: string;
  value: number;
  deltas: { h1: number | null; d1: number | null; d7: number | null };
  sparklineValues: number[];
}) {
  return (
    <div className="rounded-lg border border-black/[0.045] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(value)}</div>
        </div>
        <BarChart3 className="mt-1 size-4 text-[var(--app-primary)]" />
      </div>
      <div className="mt-4">
        <MetricSparkline values={sparklineValues} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-slate-400">1h</div>
          <TrendValue value={deltas.h1} />
        </div>
        <div>
          <div className="text-slate-400">24h</div>
          <TrendValue value={deltas.d1} />
        </div>
        <div>
          <div className="text-slate-400">7d</div>
          <TrendValue value={deltas.d7} />
        </div>
      </div>
    </div>
  );
}

export default async function UpTrendsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const search = await searchParams;
  const requestedSnapshotPage = parsePage(search.snapshotPage?.trim());
  const snapshotPageSize = parsePageSize(search.snapshotPageSize?.trim());
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - HOUR_MS);
  const oneDayAgo = new Date(now.getTime() - DAY_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const creator = await prisma.upCreator.findUnique({
    where: { id },
    include: { _count: { select: { contents: true } } },
  });

  if (!creator) notFound();

  const snapshotWhere = {
    creatorId: creator.id,
    contentId: null,
  };
  const snapshotTotal = await prisma.metricSnapshot.count({ where: snapshotWhere });
  const snapshotPage = clampPage(requestedSnapshotPage, snapshotTotal, snapshotPageSize);

  const [snapshots, contentItems, contentViewSnapshots, pagedSnapshotsWithPrevious] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: {
        ...snapshotWhere,
        capturedAt: { gte: thirtyDaysAgo },
      },
      select: {
        capturedAt: true,
        followerCount: true,
        viewCount: true,
        likeCount: true,
        videoCount: true,
      },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.contentItem.findMany({
      where: { creatorId: creator.id },
      select: {
        id: true,
        viewCount: true,
      },
    }),
    prisma.metricSnapshot.findMany({
      where: {
        contentId: { not: null },
        content: { creatorId: creator.id },
        capturedAt: { gte: thirtyDaysAgo },
      },
      select: {
        contentId: true,
        capturedAt: true,
        viewCount: true,
      },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.metricSnapshot.findMany({
      where: snapshotWhere,
      select: {
        capturedAt: true,
        followerCount: true,
        viewCount: true,
        likeCount: true,
        videoCount: true,
      },
      orderBy: { capturedAt: "desc" },
      skip: pageOffset(snapshotPage, snapshotPageSize),
      take: snapshotPageSize + 1,
    }),
  ]);
  const contentViewSnapshotsByContentId = new Map<string, ContentViewSnapshot[]>();
  for (const snapshot of contentViewSnapshots) {
    if (!snapshot.contentId) continue;
    const list = contentViewSnapshotsByContentId.get(snapshot.contentId) ?? [];
    list.push(snapshot);
    contentViewSnapshotsByContentId.set(snapshot.contentId, list);
  }
  const contentViewTotal = sumContentViews(contentItems);

  const metricPanels = [
    {
      title: "粉丝数",
      value: creator.followerCount,
      metric: "followerCount" as const,
      sparklineValues: metricValues(snapshots, "followerCount"),
      deltas: {
        h1: metricDelta(creator.followerCount, snapshots, "followerCount", oneHourAgo),
        d1: metricDelta(creator.followerCount, snapshots, "followerCount", oneDayAgo),
        d7: metricDelta(creator.followerCount, snapshots, "followerCount", sevenDaysAgo),
      },
    },
    {
      title: "播放量",
      value: contentViewTotal,
      metric: "viewCount" as const,
      sparklineValues: aggregateContentViewValues(contentViewSnapshots, contentViewTotal),
      deltas: {
        h1: contentViewDelta(contentItems, contentViewSnapshotsByContentId, oneHourAgo),
        d1: contentViewDelta(contentItems, contentViewSnapshotsByContentId, oneDayAgo),
        d7: contentViewDelta(contentItems, contentViewSnapshotsByContentId, sevenDaysAgo),
      },
    },
    {
      title: "获赞数",
      value: creator.likeCount,
      metric: "likeCount" as const,
      sparklineValues: metricValues(snapshots, "likeCount"),
      deltas: {
        h1: metricDelta(creator.likeCount, snapshots, "likeCount", oneHourAgo),
        d1: metricDelta(creator.likeCount, snapshots, "likeCount", oneDayAgo),
        d7: metricDelta(creator.likeCount, snapshots, "likeCount", sevenDaysAgo),
      },
    },
    {
      title: "投稿数",
      value: creator.videoCount,
      metric: "videoCount" as const,
      sparklineValues: metricValues(snapshots, "videoCount"),
      deltas: {
        h1: metricDelta(creator.videoCount, snapshots, "videoCount", oneHourAgo),
        d1: metricDelta(creator.videoCount, snapshots, "videoCount", oneDayAgo),
        d7: metricDelta(creator.videoCount, snapshots, "videoCount", sevenDaysAgo),
      },
    },
  ];

  const snapshotRows = pagedSnapshotsWithPrevious
    .slice(0, snapshotPageSize)
    .map((snapshot, index) => {
      const previous = pagedSnapshotsWithPrevious[index + 1];
      return {
        snapshot,
        followerDelta: snapshotDelta(snapshot, previous, "followerCount"),
        likeDelta: snapshotDelta(snapshot, previous, "likeCount"),
        videoDelta: snapshotDelta(snapshot, previous, "videoCount"),
      };
    });

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          {creator.avatarUrl ? (
            <Image
              src={creator.avatarUrl}
              alt=""
              width={56}
              height={56}
              className="size-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold">
              {creatorDisplayName(creator).slice(0, 1)}
            </div>
          )}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-normal">{creatorDisplayName(creator)} 趋势</h1>
              <Badge variant="outline" className="bg-sky-50 text-sky-700">
                {creator.groupName}
              </Badge>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-medium",
                  statusTextClass(creator.status),
                )}
              >
                <span className={cn("size-2 rounded-full", statusDotClass(creator.status))} />
                {statusLabel(creator.status)}
              </span>
            </div>
            <p className="text-sm text-slate-500">
              UID: {creator.mid} · 入库内容 {formatNumber(creator._count.contents)} 条 · 最近更新{" "}
              {formatDateTime(creator.lastFetchedAt)}
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/ups">
            <ArrowLeft className="size-4" />
            返回 UP 主管理
          </Link>
        </Button>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metricPanels.map((panel) => (
          <MetricPanel
            key={panel.metric}
            title={panel.title}
            value={panel.value}
            deltas={panel.deltas}
            sparklineValues={panel.sparklineValues}
          />
        ))}
      </section>

      <section className="rounded-lg border border-black/[0.055] bg-white">
        <div className="flex flex-col gap-1 border-b border-black/[0.045] px-6 py-4">
          <h2 className="font-semibold">最近 UP 快照</h2>
          <p className="text-sm text-slate-500">
            分页展示 UP 名片快照；播放量趋势按内容库快照汇总，显示在上方卡片。
          </p>
        </div>
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>抓取时间</TableHead>
              <TableHead>粉丝数</TableHead>
              <TableHead>Δ 粉丝</TableHead>
              <TableHead>获赞数</TableHead>
              <TableHead>Δ 获赞</TableHead>
              <TableHead>投稿数</TableHead>
              <TableHead>Δ 投稿</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshotRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  暂无趋势快照。执行同步后会开始记录。
                </TableCell>
              </TableRow>
            ) : (
              snapshotRows.map((row) => (
                <TableRow key={row.snapshot.capturedAt.toISOString()}>
                  <TableCell>{formatFullDateTime(row.snapshot.capturedAt)}</TableCell>
                  <TableCell>
                    <NumberValue>{formatExactMaybeNumber(row.snapshot.followerCount)}</NumberValue>
                  </TableCell>
                  <TableCell>
                    <SnapshotTrendValue value={row.followerDelta} />
                  </TableCell>
                  <TableCell>
                    <NumberValue>{formatExactMaybeNumber(row.snapshot.likeCount)}</NumberValue>
                  </TableCell>
                  <TableCell>
                    <SnapshotTrendValue value={row.likeDelta} />
                  </TableCell>
                  <TableCell>
                    <NumberValue>{formatExactMaybeNumber(row.snapshot.videoCount)}</NumberValue>
                  </TableCell>
                  <TableCell>
                    <SnapshotTrendValue value={row.videoDelta} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          total={snapshotTotal}
          page={snapshotPage}
          pageSize={snapshotPageSize}
          pageParam="snapshotPage"
          pageSizeParam="snapshotPageSize"
        />
      </section>
    </div>
  );
}

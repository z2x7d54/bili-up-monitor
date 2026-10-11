import { creatorDisplayName } from "@/lib/creator-personal";
import { withDataWrite } from "@/lib/data-transfer-lock";
import { videoCollectionStart } from "@/lib/weekly";
import { businessDates } from "@/lib/monthly";
import type { MonitorTask, Prisma, UpCreator } from "@prisma/client";
import { CREATOR_STATUS, DEFAULT_GROUP_NAME, RUN_STATUS, TASK_STATUS, TASK_TARGET_MODE } from "@/lib/constants";
import { fetchCreatorProfile, fetchCreatorVideos, isRiskControlError } from "@/lib/bilibili/client";
import { parseUpInput } from "@/lib/bilibili/utils";
import { ensureSettings, prisma } from "@/lib/db";
import { ensureCreatorGroup, getGroupScope } from "@/lib/groups";
import {
  calculateFailureBackoffMinutes,
  calculateNextRunAt,
  jitterDelay,
  shouldRunTask,
} from "@/lib/monitor/scheduling";
import { clampPage, pageOffset } from "@/lib/pagination";

type SyncOptions = {
  maxVideos?: number;
};

type CreateTaskInput = {
  name: string;
  targetMode: string;
  groupName?: string | null;
  intervalMinutes: number;
  status?: string;
  creatorIds?: string[];
};

const TASK_RUN_TIMEOUT_MS = 3 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const globalMonitorRuntime = globalThis as unknown as {
  yourBiliActiveMonitorTasks?: Set<string>;
};
const activeMonitorTaskIds =
  globalMonitorRuntime.yourBiliActiveMonitorTasks ?? new Set<string>();
globalMonitorRuntime.yourBiliActiveMonitorTasks = activeMonitorTaskIds;

function readableError(error: unknown): string {
  if (isRiskControlError(error)) return "风控校验失败";
  if (error instanceof Error) return error.message;
  return String(error);
}

async function createOrUpdateCreatorFromInputImplementation(input: {
  upInput: string;
  groupName?: string | null;
}) {
  const mid = parseUpInput(input.upInput);
  const profile = await fetchCreatorProfile(mid);
  const groupName = input.groupName?.trim() || DEFAULT_GROUP_NAME;
  const now = new Date();

  await ensureCreatorGroup(groupName);

  const creator = await prisma.upCreator.upsert({
    where: { mid },
    create: {
      mid: profile.mid,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      description: profile.description,
      groupName,
      status: CREATOR_STATUS.MONITORING,
      followingCount: profile.followingCount,
      followerCount: profile.followerCount,
      likeCount: profile.likeCount,
      viewCount: profile.viewCount,
      videoCount: profile.videoCount,
      lastFetchedAt: now,
      lastError: null,
    },
    update: {
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      description: profile.description,
      groupName,
      status: CREATOR_STATUS.MONITORING,
      followingCount: profile.followingCount,
      followerCount: profile.followerCount,
      likeCount: profile.likeCount,
      viewCount: profile.viewCount,
      videoCount: profile.videoCount,
      lastFetchedAt: now,
      lastError: null,
    },
  });

  await prisma.metricSnapshot.create({
    data: {
      creatorId: creator.id,
      followerCount: creator.followerCount,
      followingCount: creator.followingCount,
      likeCount: creator.likeCount,
      viewCount: creator.viewCount,
      videoCount: creator.videoCount,
    },
  });

  return creator;
}

async function syncCreatorByIdImplementation(creatorId: string, options: SyncOptions = {}) {
  const settings = await ensureSettings();
  const creator = await prisma.upCreator.findUniqueOrThrow({ where: { id: creatorId } });
  const maxVideos = options.maxVideos ?? settings.maxVideosPerUp;
  const now = new Date();

  let updatedCreator: UpCreator;
  try {
    const profile = await fetchCreatorProfile(creator.mid);
    updatedCreator = await prisma.upCreator.update({
      where: { id: creator.id },
      data: {
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        description: profile.description,
        status: CREATOR_STATUS.MONITORING,
        followingCount: profile.followingCount,
        followerCount: profile.followerCount,
        likeCount: profile.likeCount,
        viewCount: profile.viewCount,
        videoCount: profile.videoCount,
        lastFetchedAt: now,
        lastFailedAt: null,
        lastError: null,
      },
    });

    await prisma.metricSnapshot.create({
      data: {
        creatorId: updatedCreator.id,
        followerCount: updatedCreator.followerCount,
        followingCount: updatedCreator.followingCount,
        likeCount: updatedCreator.likeCount,
        viewCount: updatedCreator.viewCount,
        videoCount: updatedCreator.videoCount,
      },
    });
  } catch (error) {
    const message = readableError(error);
    await prisma.upCreator.update({
      where: { id: creator.id },
      data: {
        status: creator.status === CREATOR_STATUS.PAUSED ? creator.status : CREATOR_STATUS.ERROR,
        lastFailedAt: new Date(),
        lastError: message,
      },
    });
    throw new Error(message);
  }

  let videos;
  try {
    videos = await fetchCreatorVideos(creator.mid, maxVideos, { now });
  } catch (error) {
    const message = readableError(error);
    await prisma.upCreator.update({
      where: { id: creator.id },
      data: {
        status: creator.status === CREATOR_STATUS.PAUSED ? creator.status : CREATOR_STATUS.MONITORING,
        lastFailedAt: new Date(),
        lastError: `内容抓取失败：${message}`,
      },
    });
    throw new Error(`内容抓取失败：${message}`);
  }

  let contentCount = 0;
  for (const video of videos) {
    const content = await prisma.contentItem.upsert({
      where: { bvid: video.bvid },
      create: {
        bvid: video.bvid,
        aid: video.aid,
        creatorId: updatedCreator.id,
        title: video.title,
        coverUrl: video.coverUrl,
        publishedAt: video.publishedAt,
        durationText: video.durationText,
        durationSeconds: video.durationSeconds,
        category: video.category,
        viewCount: video.viewCount,
        danmakuCount: video.danmakuCount,
        replyCount: video.replyCount,
        favoriteCount: video.favoriteCount,
        coinCount: video.coinCount,
        shareCount: video.shareCount,
        likeCount: video.likeCount,
        lastFetchedAt: now,
      },
      update: {
        creatorId: updatedCreator.id,
        title: video.title,
        coverUrl: video.coverUrl,
        publishedAt: video.publishedAt,
        durationText: video.durationText,
        durationSeconds: video.durationSeconds,
        category: video.category,
        viewCount: video.viewCount,
        danmakuCount: video.danmakuCount,
        replyCount: video.replyCount,
        favoriteCount: video.favoriteCount,
        coinCount: video.coinCount,
        shareCount: video.shareCount,
        likeCount: video.likeCount,
        lastFetchedAt: now,
      },
    });

    await prisma.metricSnapshot.create({
      data: {
        contentId: content.id,
        viewCount: content.viewCount,
        danmakuCount: content.danmakuCount,
        replyCount: content.replyCount,
        favoriteCount: content.favoriteCount,
        coinCount: content.coinCount,
        shareCount: content.shareCount,
        likeCount: content.likeCount,
      },
    });
    contentCount += 1;
  }

  updatedCreator = await prisma.upCreator.update({
    where: { id: creator.id },
    data: { lastVideoSyncFromAt: videoCollectionStart(now), lastVideoSyncAt: new Date(), videoSyncMonth: businessDates(now).monthKey, lastError: null },
  });
  return { creator: updatedCreator, contentCount };
}

async function createMonitorTaskImplementation(input: CreateTaskInput) {
  const intervalMinutes = Math.max(1, Math.min(24 * 60, input.intervalMinutes));
  const targetMode = Object.values(TASK_TARGET_MODE).includes(input.targetMode as (typeof TASK_TARGET_MODE)[keyof typeof TASK_TARGET_MODE])
    ? input.targetMode
    : TASK_TARGET_MODE.ALL_ACTIVE;

  return prisma.monitorTask.create({
    data: {
      name: input.name.trim() || "未命名监控任务",
      targetMode,
      groupName: targetMode === TASK_TARGET_MODE.GROUP ? input.groupName?.trim() || DEFAULT_GROUP_NAME : null,
      intervalMinutes,
      status: input.status === TASK_STATUS.PAUSED ? TASK_STATUS.PAUSED : TASK_STATUS.ACTIVE,
      nextRunAt: calculateNextRunAt(new Date(), intervalMinutes),
      targets:
        targetMode === TASK_TARGET_MODE.SELECTED && input.creatorIds?.length
          ? {
              create: input.creatorIds.map((creatorId) => ({
                creatorId,
              })),
            }
          : undefined,
    },
    include: { targets: true },
  });
}

async function updateMonitorTaskImplementation(id: string, input: Partial<CreateTaskInput>) {
  const targetMode = input.targetMode;
  const nextTargetMode =
    targetMode && Object.values(TASK_TARGET_MODE).includes(targetMode as never) ? targetMode : undefined;

  return prisma.$transaction(async (tx) => {
    const currentTask = await tx.monitorTask.findUniqueOrThrow({ where: { id } });
    const effectiveMode = nextTargetMode ?? currentTask.targetMode;
    const task = await tx.monitorTask.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        targetMode: nextTargetMode,
        groupName:
          effectiveMode === TASK_TARGET_MODE.GROUP && (input.groupName !== undefined || nextTargetMode !== undefined)
            ? input.groupName?.trim() || DEFAULT_GROUP_NAME
            : nextTargetMode
              ? null
              : undefined,
        intervalMinutes: input.intervalMinutes
          ? Math.max(1, Math.min(24 * 60, input.intervalMinutes))
          : undefined,
        status: input.status,
      },
    });

    if (effectiveMode === TASK_TARGET_MODE.SELECTED && (input.creatorIds !== undefined || nextTargetMode !== undefined)) {
      await tx.taskTarget.deleteMany({ where: { taskId: id } });
      if (input.creatorIds?.length) {
        await tx.taskTarget.createMany({
          data: input.creatorIds.map((creatorId) => ({ taskId: id, creatorId })),
        });
      }
    } else if (nextTargetMode) {
      await tx.taskTarget.deleteMany({ where: { taskId: id } });
    }

    return task;
  });
}

async function resolveTaskCreators(task: MonitorTask) {
  if (task.targetMode === TASK_TARGET_MODE.GROUP) {
    return prisma.upCreator.findMany({
      where: {
        groupName: { in: await getGroupScope(task.groupName || DEFAULT_GROUP_NAME) },
        status: { not: CREATOR_STATUS.PAUSED },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (task.targetMode === TASK_TARGET_MODE.SELECTED) {
    const targets = await prisma.taskTarget.findMany({
      where: { taskId: task.id },
      include: { creator: true },
    });
    return targets
      .map((target) => target.creator)
      .filter((creator) => creator.status !== CREATOR_STATUS.PAUSED);
  }

  return prisma.upCreator.findMany({
    where: { status: { not: CREATOR_STATUS.PAUSED } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function expireStaleRunningTasks(now = new Date()) {
  const cutoff = new Date(now.getTime() - TASK_RUN_TIMEOUT_MS);
  const staleTasks = await prisma.monitorTask.findMany({
    where: {
      isRunning: true,
      lastRunAt: { lte: cutoff },
    },
    select: { id: true, name: true },
  });
  const expiredTasks = staleTasks.filter((task) => !activeMonitorTaskIds.has(task.id));
  if (expiredTasks.length === 0) return [];

  const message = "任务运行超过 3 分钟，已自动终止";
  await prisma.$transaction(
    expiredTasks.flatMap((task) => [
      prisma.taskRunLog.updateMany({
        where: {
          taskId: task.id,
          status: RUN_STATUS.RUNNING,
          finishedAt: null,
        },
        data: {
          status: RUN_STATUS.FAILED,
          finishedAt: now,
          failureCount: 1,
          errorCode: "TASK_TIMEOUT",
          errorMessage: message,
        },
      }),
      prisma.monitorTask.update({
        where: { id: task.id },
        data: {
          isRunning: false,
          lastFailedAt: now,
          lastError: message,
          lastResult: message,
          nextRunAt: calculateNextRunAt(now, calculateFailureBackoffMinutes(1)),
        },
      }),
    ]),
  );

  return expiredTasks;
}

async function runMonitorTaskImplementation(taskId: string, options: { skipDelay?: boolean } = {}) {
  await expireStaleRunningTasks();
  if (activeMonitorTaskIds.has(taskId)) {
    throw new Error("任务正在运行中，请等待本轮执行完成");
  }
  activeMonitorTaskIds.add(taskId);

  try {
    const task = await prisma.monitorTask.findUniqueOrThrow({ where: { id: taskId } });
    if (task.isRunning) {
      throw new Error("任务正在运行中，请等待本轮执行完成");
    }

    const settings = await ensureSettings();
    const startedAt = new Date();
    const runLog = await prisma.taskRunLog.create({
      data: {
        taskId,
        status: RUN_STATUS.RUNNING,
        startedAt,
      },
    });

    await prisma.monitorTask.update({
      where: { id: taskId },
      data: {
        isRunning: true,
        lastRunAt: startedAt,
      },
    });

    const details: Array<{ mid: string; name: string; status: string; message?: string }> = [];
    let successCount = 0;
    let failureCount = 0;
    let itemCount = 0;

    try {
      const creators = await resolveTaskCreators(task);

      for (const [index, creator] of creators.entries()) {
        if (index > 0 && !options.skipDelay) {
          await sleep(jitterDelay(settings.requestDelayMinMs, settings.requestDelayMaxMs));
        }

        try {
          const result = await syncCreatorById(creator.id, { maxVideos: settings.maxVideosPerUp });
          successCount += 1;
          itemCount += result.contentCount;
          details.push({ mid: creator.mid, name: result.creator.name, status: "success" });
        } catch (error) {
          failureCount += 1;
          details.push({
            mid: creator.mid,
            name: creatorDisplayName(creator),
            status: "failed",
            message: readableError(error),
          });
        }
      }

      const finishedAt = new Date();
      const status =
        failureCount === 0 ? RUN_STATUS.SUCCESS : successCount > 0 ? RUN_STATUS.PARTIAL : RUN_STATUS.FAILED;
      const nextRunAt =
        status === RUN_STATUS.FAILED
          ? calculateNextRunAt(finishedAt, calculateFailureBackoffMinutes(failureCount))
          : calculateNextRunAt(finishedAt, task.intervalMinutes);
      const lastError = failureCount > 0 ? `${failureCount} 个 UP 抓取失败` : null;

      await prisma.$transaction([
        prisma.taskRunLog.update({
          where: { id: runLog.id },
          data: {
            status,
            finishedAt,
            successCount,
            failureCount,
            itemCount,
            errorCode: failureCount > 0 ? "PARTIAL_FAILURE" : null,
            errorMessage: lastError,
            details: JSON.stringify(details),
          },
        }),
        prisma.monitorTask.update({
          where: { id: taskId },
          data: {
            isRunning: false,
            nextRunAt,
            lastSuccessAt: successCount > 0 ? finishedAt : task.lastSuccessAt,
            lastFailedAt: failureCount > 0 ? finishedAt : null,
            lastResult: `成功 ${successCount} 个，失败 ${failureCount} 个，内容 ${itemCount} 条`,
            lastError,
          },
        }),
      ]);

      return { status, successCount, failureCount, itemCount, details };
    } catch (error) {
      const finishedAt = new Date();
      const message = readableError(error);
      await prisma.$transaction([
        prisma.taskRunLog.update({
          where: { id: runLog.id },
          data: {
            status: RUN_STATUS.FAILED,
            finishedAt,
            successCount,
            failureCount: failureCount || 1,
            itemCount,
            errorCode: "TASK_FAILED",
            errorMessage: message,
            details: JSON.stringify(details),
          },
        }),
        prisma.monitorTask.update({
          where: { id: taskId },
          data: {
            isRunning: false,
            lastFailedAt: finishedAt,
            lastError: message,
            nextRunAt: calculateNextRunAt(finishedAt, calculateFailureBackoffMinutes(1)),
          },
        }),
      ]);
      throw error;
    }
  } finally {
    activeMonitorTaskIds.delete(taskId);
  }
}

export async function runDueTasks() {
  await expireStaleRunningTasks();
  const settings = await ensureSettings();
  if (!settings.schedulerEnabled) return [];

  const tasks = await prisma.monitorTask.findMany({
    where: { status: TASK_STATUS.ACTIVE },
    orderBy: { nextRunAt: "asc" },
  });

  const dueTasks = tasks.filter((task) => shouldRunTask(task));
  const results = [];
  for (const task of dueTasks) {
    results.push(await runMonitorTask(task.id));
  }
  return results;
}

export async function getDashboardData(options: { recentContentsPage?: number; recentContentsPageSize?: number } = {}) {
  await ensureSettings();
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const historyStart = new Date(oneDayAgo.getTime() - 24 * 60 * 60 * 1000);

  const [
    creatorCount,
    monitoringCount,
    errorCreatorCount,
    contentCount,
    todayContentCount,
    activeTaskCount,
    failedTasks,
    recentRuns,
    latestRun,
    latestCreatorFetch,
    latestContentFetch,
    creatorsForRanking,
    contentsForRanking,
  ] = await Promise.all([
    prisma.upCreator.count(),
    prisma.upCreator.count({ where: { status: CREATOR_STATUS.MONITORING } }),
    prisma.upCreator.count({ where: { OR: [{ status: CREATOR_STATUS.ERROR }, { lastError: { not: null } }] } }),
    prisma.contentItem.count(),
    prisma.contentItem.count({ where: { publishedAt: { gte: today, lte: now } } }),
    prisma.monitorTask.count({ where: { status: TASK_STATUS.ACTIVE } }),
    prisma.monitorTask.findMany({
      where: { lastError: { not: null } },
      orderBy: { lastFailedAt: "desc" },
      take: 5,
    }),
    prisma.taskRunLog.findMany({
      include: { task: true },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.taskRunLog.findFirst({
      include: { task: true },
      orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
    }),
    prisma.upCreator.findFirst({
      where: { lastFetchedAt: { not: null } },
      orderBy: { lastFetchedAt: "desc" },
    }),
    prisma.contentItem.findFirst({
      where: { lastFetchedAt: { not: null } },
      orderBy: { lastFetchedAt: "desc" },
    }),
    prisma.upCreator.findMany({
      where: { status: { not: CREATOR_STATUS.PAUSED } },
      include: {
        snapshots: {
          where: { capturedAt: { gte: historyStart } },
          select: { capturedAt: true, followerCount: true },
          orderBy: { capturedAt: "desc" },
        },
      },
      orderBy: { followerCount: "desc" },
      take: 200,
    }),
    prisma.contentItem.findMany({
      include: {
        creator: true,
        snapshots: {
          where: { capturedAt: { gte: historyStart } },
          select: { capturedAt: true, viewCount: true },
          orderBy: { capturedAt: "desc" },
        },
      },
      orderBy: [{ viewCount: "desc" }, { lastFetchedAt: "desc" }],
    }),
  ]);

  function snapshotAtOrBefore<T extends { capturedAt: Date }>(snapshots: T[], cutoff: Date) {
    return snapshots.find((snapshot) => snapshot.capturedAt.getTime() <= cutoff.getTime());
  }

  const creatorGrowthRanking = creatorsForRanking
    .map((creator) => {
      const oneDaySnapshot = snapshotAtOrBefore(creator.snapshots, oneDayAgo);
      const growth24h =
        oneDaySnapshot?.followerCount === null || oneDaySnapshot?.followerCount === undefined
          ? null
          : creator.followerCount - oneDaySnapshot.followerCount;

      return {
        id: creator.id,
        name: creatorDisplayName(creator),
        avatarUrl: creator.avatarUrl,
        followerCount: creator.followerCount,
        videoCount: creator.videoCount,
        growth24h,
      };
    })
    .sort((a, b) => (b.growth24h ?? Number.NEGATIVE_INFINITY) - (a.growth24h ?? Number.NEGATIVE_INFINITY))
    .slice(0, 5);

  const contentGrowthCandidates = contentsForRanking.map((content) => {
    const oneDaySnapshot = snapshotAtOrBefore(content.snapshots, oneDayAgo);
    const growth24h =
      oneDaySnapshot?.viewCount === null || oneDaySnapshot?.viewCount === undefined
        ? null
        : content.viewCount - oneDaySnapshot.viewCount;

    return {
      id: content.id,
      bvid: content.bvid,
      title: content.title,
      coverUrl: content.coverUrl,
      durationText: content.durationText,
      durationSeconds: content.durationSeconds,
      viewCount: content.viewCount,
      growth24h,
      creator: {
        id: content.creator.id,
        name: creatorDisplayName(content.creator),
        avatarUrl: content.creator.avatarUrl,
      },
    };
  });
  const contentGrowthRanking = [
    ...contentGrowthCandidates
      .filter((content): content is typeof content & { growth24h: number } => content.growth24h !== null)
      .sort((a, b) => b.growth24h - a.growth24h),
    ...contentGrowthCandidates
      .filter((content) => content.growth24h === null)
      .sort((a, b) => b.viewCount - a.viewCount),
  ].slice(0, 5);

  const latestCollectionCandidates = [
    latestRun?.finishedAt || latestRun?.startedAt
      ? {
          at: latestRun.finishedAt || latestRun.startedAt,
          status: latestRun.status,
          label: latestRun.task?.name || "任务采集",
          intervalMinutes: latestRun.task?.intervalMinutes ?? null,
        }
      : null,
    latestCreatorFetch?.lastFetchedAt
      ? {
          at: latestCreatorFetch.lastError && latestCreatorFetch.lastFailedAt ? latestCreatorFetch.lastFailedAt : latestCreatorFetch.lastFetchedAt,
          status: latestCreatorFetch.lastError ? CREATOR_STATUS.ERROR : latestCreatorFetch.status,
          label: latestCreatorFetch.name,
          intervalMinutes: null,
        }
      : null,
    latestContentFetch?.lastFetchedAt
      ? {
          at: latestContentFetch.lastFetchedAt,
          status: RUN_STATUS.SUCCESS,
          label: latestContentFetch.title,
          intervalMinutes: null,
        }
      : null,
  ].filter((item): item is { at: Date; status: string; label: string; intervalMinutes: number | null } => Boolean(item?.at));
  const latestCollection = latestCollectionCandidates.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;

  const recentContentsPageSize = options.recentContentsPageSize ?? 30;
  const recentContentsPage = clampPage(options.recentContentsPage ?? 1, contentCount, recentContentsPageSize);
  const recentContents = await prisma.contentItem.findMany({
    include: { creator: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    skip: pageOffset(recentContentsPage, recentContentsPageSize),
    take: recentContentsPageSize,
  });

  return {
    stats: {
      creatorCount,
      monitoringCount,
      errorCreatorCount,
      contentCount,
      todayContentCount,
      activeTaskCount,
    },
    failedTasks,
    latestCollection,
    creatorGrowthRanking,
    contentGrowthRanking,
    recentContents,
    recentContentsPage,
    recentRuns,
  };
}

export type CreatorWithCounts = UpCreator & {
  _count?: Prisma.UpCreatorCountOutputType;
};

export async function createOrUpdateCreatorFromInput(...args: Parameters<typeof createOrUpdateCreatorFromInputImplementation>) {
  return withDataWrite(() => createOrUpdateCreatorFromInputImplementation(...args));
}

export async function syncCreatorById(...args: Parameters<typeof syncCreatorByIdImplementation>) {
  return withDataWrite(() => syncCreatorByIdImplementation(...args));
}

export async function runMonitorTask(...args: Parameters<typeof runMonitorTaskImplementation>) {
  return withDataWrite(() => runMonitorTaskImplementation(...args));
}

export async function createMonitorTask(...args: Parameters<typeof createMonitorTaskImplementation>) { return withDataWrite(() => createMonitorTaskImplementation(...args)); }

export async function updateMonitorTask(...args: Parameters<typeof updateMonitorTaskImplementation>) { return withDataWrite(() => updateMonitorTaskImplementation(...args)); }

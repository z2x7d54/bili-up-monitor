import { videoCollectionStart } from "@/lib/weekly";
import { BILI_REQUEST_HEADERS } from "@/lib/constants";
import { getBiliRequestCookie } from "@/lib/bilibili/session";
import {
  fromUnixSeconds,
  normalizeBiliUrl,
  parseBiliNumber,
  parseDurationToSeconds,
} from "@/lib/bilibili/utils";
import { signWithLiveWbiKeys } from "@/lib/bilibili/wbi";

export class BiliApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number | string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "BiliApiError";
  }
}

type BiliResponse<T> = {
  code: number;
  message?: string;
  msg?: string;
  data?: T;
};

type CreatorCardResponse = {
  card?: {
    mid?: string | number;
    name?: string;
    face?: string;
    sign?: string;
    friend?: number;
    fans?: number;
  };
  following?: boolean;
  archive_count?: number;
  article_count?: number;
  follower?: number;
  like_num?: number;
};

type ArcSearchResponse = {
  list?: {
    vlist?: Array<{
      aid?: string | number;
      bvid?: string;
      title?: string;
      pic?: string;
      created?: number;
      length?: string;
      play?: string | number;
      video_review?: string | number;
      comment?: string | number;
      typeid?: number;
      typename?: string;
    }>;
  };
  page?: {
    count?: number;
    pn?: number;
    ps?: number;
  };
};

type VideoStatFields = {
  aid?: number | string;
  bvid?: string;
  view?: number | string;
  danmaku?: number | string;
  reply?: number | string;
  favorite?: number | string;
  coin?: number | string;
  share?: number | string;
  like?: number | string;
};

type VideoViewResponse = VideoStatFields & {
  stat?: VideoStatFields;
};

export type BiliCreatorProfile = {
  mid: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  followingCount: number;
  followerCount: number;
  likeCount: number;
  viewCount: number;
  videoCount: number;
};

export type BiliVideoItem = {
  bvid: string;
  aid: string | null;
  title: string;
  coverUrl: string | null;
  publishedAt: Date | null;
  durationText: string | null;
  durationSeconds: number;
  category: string | null;
  viewCount: number;
  danmakuCount: number;
  replyCount: number;
  favoriteCount: number;
  coinCount: number;
  shareCount: number;
  likeCount: number;
};

export type BiliVideoStats = Pick<
  BiliVideoItem,
  "viewCount" | "danmakuCount" | "replyCount" | "favoriteCount" | "coinCount" | "shareCount" | "likeCount"
>;

async function fetchBiliJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...BILI_REQUEST_HEADERS,
      ...init?.headers,
    },
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });

  let payload: BiliResponse<T>;
  try {
    payload = (await response.json()) as BiliResponse<T>;
  } catch {
    throw new BiliApiError(`B 站接口返回非 JSON：HTTP ${response.status}`, "INVALID_JSON", response.status);
  }

  if (!response.ok || payload.code !== 0 || !payload.data) {
    const message = payload.message || payload.msg || `B 站接口失败：HTTP ${response.status}`;
    throw new BiliApiError(message, payload.code, response.status);
  }

  return payload.data;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

export async function fetchCreatorProfile(mid: string): Promise<BiliCreatorProfile> {
  const url = new URL("https://api.bilibili.com/x/web-interface/card");
  url.searchParams.set("mid", mid);
  url.searchParams.set("photo", "true");

  const data = await fetchBiliJson<CreatorCardResponse>(url.toString());
  const card = data.card;
  if (!card?.mid || !card.name) {
    throw new BiliApiError("B 站用户名片响应缺少 UP 主信息", "INVALID_CARD");
  }

  return {
    mid: String(card.mid),
    name: card.name,
    avatarUrl: normalizeBiliUrl(card.face),
    description: card.sign || null,
    followingCount: parseBiliNumber(card.friend),
    followerCount: parseBiliNumber(card.fans ?? data.follower),
    likeCount: parseBiliNumber(data.like_num),
    viewCount: 0,
    videoCount: parseBiliNumber(data.archive_count),
  };
}

export async function fetchVideoStats(bvid: string, cookie?: string): Promise<BiliVideoStats> {
  const url = new URL("https://api.bilibili.com/x/web-interface/view");
  url.searchParams.set("bvid", bvid);

  const data = await fetchBiliJson<VideoViewResponse>(url.toString(), {
    headers: {
      ...(cookie ? { cookie } : {}),
      referer: `https://www.bilibili.com/video/${bvid}`,
    },
  });
  const stat = data.stat ?? data;

  return {
    viewCount: parseBiliNumber(stat.view),
    danmakuCount: parseBiliNumber(stat.danmaku),
    replyCount: parseBiliNumber(stat.reply),
    favoriteCount: parseBiliNumber(stat.favorite),
    coinCount: parseBiliNumber(stat.coin),
    shareCount: parseBiliNumber(stat.share),
    likeCount: parseBiliNumber(stat.like),
  };
}

export async function fetchCreatorVideos(
  mid: string, limit = 30, options: { now?: Date; pageDelayMs?: number } = {},
): Promise<BiliVideoItem[]> {
  const cookie = await getBiliRequestCookie();
  // Cover six calendar months for monthly comparisons, plus the configured recent minimum.
  const monthStart = videoCollectionStart(options.now ?? new Date());
  const minRecent = Math.min(Math.max(Math.floor(limit), 1), 50);
  const pageSize = 50;
  const collected: NonNullable<NonNullable<ArcSearchResponse["list"]>["vlist"]> = [];
  const seen = new Set<string>();
  let exhausted = false;
  for (let page = 1; page <= 100; page++) {
    if (page > 1) await new Promise(resolve => setTimeout(resolve, options.pageDelayMs ?? 600));
    const signedParams = await signWithLiveWbiKeys({ mid, pn: page, ps: pageSize, tid: 0, keyword: "", order: "pubdate", platform: "web" });
    const url = new URL("https://api.bilibili.com/x/space/wbi/arc/search");
    for (const [key, value] of Object.entries(signedParams)) url.searchParams.set(key, value);
    const data = await fetchBiliJson<ArcSearchResponse>(url.toString(), {
      headers: { cookie, referer: "https://space.bilibili.com/" + mid + "/video" },
    });
    const list = data.list?.vlist ?? [];
    let added = 0;
    for (const item of list) {
      if (!item.bvid || !item.title || seen.has(item.bvid)) continue;
      seen.add(item.bvid); collected.push(item); added++;
    }
    const reachedOlder = list.some(item => item.created && fromUnixSeconds(item.created)! < monthStart);
    if (list.length < pageSize || (typeof data.page?.count === "number" && page * pageSize >= data.page.count) ||
        (reachedOlder && collected.length >= minRecent)) { exhausted = true; break; }
    if (list.length && added === 0) throw new BiliApiError("视频分页返回重复数据，所选历史范围未采集完整", "INCOMPLETE_MONTH");
  }
  if (!exhausted) throw new BiliApiError("近六个月视频超过分页采集上限，所选历史范围未采集完整", "INCOMPLETE_MONTH");
  const selected = collected.filter((item, index) => index < minRecent || (item.created && fromUnixSeconds(item.created)! >= monthStart));
  const videos = selected.map(item => ({
    bvid: item.bvid!, aid: item.aid ? String(item.aid) : null, title: item.title ?? "",
    coverUrl: normalizeBiliUrl(item.pic), publishedAt: fromUnixSeconds(item.created),
    durationText: item.length ?? null, durationSeconds: parseDurationToSeconds(item.length), category: item.typename ?? null,
    viewCount: parseBiliNumber(item.play), danmakuCount: parseBiliNumber(item.video_review), replyCount: parseBiliNumber(item.comment),
    favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0,
  }));
  // Never replace known interactions with fabricated zeros when the detail API fails.
  return mapWithConcurrency(videos, 4, async video => ({ ...video, ...await fetchVideoStats(video.bvid, cookie) }));
}

export function isRiskControlError(error: unknown): boolean {
  return error instanceof BiliApiError && (String(error.code) === "-412" || error.status === 412);
}

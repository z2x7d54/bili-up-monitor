import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bilibili/session", () => ({
  getBiliRequestCookie: vi.fn(async () => "SESSDATA=test"),
}));

vi.mock("@/lib/bilibili/wbi", () => ({
  signWithLiveWbiKeys: vi.fn(async (params: Record<string, string | number | boolean | undefined | null>) => {
    const signed: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) signed[key] = String(value);
    }
    signed.w_rid = "mock";
    return signed;
  }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("bilibili client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("hydrates favorite, coin, like, and share counts from video stat endpoint", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));

      if (url.pathname === "/x/space/wbi/arc/search") {
        return jsonResponse({
          code: 0,
          data: {
            list: {
              vlist: [
                {
                  aid: 1,
                  bvid: "BV1xx411c7mD",
                  title: "视频 1",
                  pic: "//i0.hdslb.com/bfs/archive/1.jpg",
                  created: 1700000000,
                  length: "01:02",
                  play: 100,
                  video_review: 20,
                  comment: 3,
                  typename: "科技",
                },
              ],
            },
          },
        });
      }

      if (url.pathname === "/x/web-interface/view") {
        expect(url.searchParams.get("bvid")).toBe("BV1xx411c7mD");
        return jsonResponse({
          code: 0,
          data: {
            stat: {
              view: 1234,
              danmaku: 56,
              reply: 78,
              favorite: 90,
              coin: 12,
              share: 34,
              like: 567,
            },
          },
        });
      }

      throw new Error(`Unexpected URL: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchCreatorVideos } = await import("@/lib/bilibili/client");
    const videos = await fetchCreatorVideos("123", 10);

    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      bvid: "BV1xx411c7mD",
      viewCount: 1234,
      danmakuCount: 56,
      replyCount: 78,
      favoriteCount: 90,
      coinCount: 12,
      shareCount: 34,
      likeCount: 567,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects failed video details instead of inventing zero interactions", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));

      if (url.pathname === "/x/space/wbi/arc/search") {
        return jsonResponse({
          code: 0,
          data: {
            list: {
              vlist: [
                {
                  aid: 2,
                  bvid: "BV2xx411c7mD",
                  title: "视频 2",
                  play: "200",
                  video_review: "110",
                  comment: "90",
                },
              ],
            },
          },
        });
      }

      if (url.pathname === "/x/web-interface/view") {
        return jsonResponse({ code: -412, message: "请求被拦截" }, 412);
      }

      throw new Error(`Unexpected URL: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchCreatorVideos } = await import("@/lib/bilibili/client");
    await expect(fetchCreatorVideos("123", 10)).rejects.toMatchObject({ code: -412, status: 412 });
  });
  it("fetches current and previous month videos across pages for complete monthly reports", async () => {
    const now = new Date("2026-10-07T02:00:00Z");
    const current = Math.floor(new Date("2026-10-05T02:00:00Z").getTime() / 1000);
    const old = Math.floor(new Date("2026-09-27T02:00:00Z").getTime() / 1000);
    const all = Array.from({ length: 62 }, (_, i) => ({ bvid: "BVpage" + i, title: "视频" + i, created: i < 60 ? current : old }));
    const pages: number[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("arc/search")) {
        const page = Number(url.searchParams.get("pn")); pages.push(page);
        return jsonResponse({ code: 0, data: { page: { count: 62 }, list: { vlist: all.slice((page - 1) * 50, page * 50) } } });
      }
      return jsonResponse({ code: 0, data: { stat: { view: 100, like: 5, favorite: 3, coin: 2 } } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCreatorVideos } = await import("@/lib/bilibili/client");
    const videos = await fetchCreatorVideos("123", 10, { now, pageDelayMs: 0 });
    expect(pages).toEqual([1, 2]);
    expect(videos).toHaveLength(62);
    expect(videos.filter(video => video.publishedAt! >= new Date("2026-09-30T16:00:00Z"))).toHaveLength(60);
  });

  it("reports incomplete collection when a later page fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get("pn") === "2") return jsonResponse({ code: -412, message: "分页被拦截" }, 412);
      return jsonResponse({ code: 0, data: { list: { vlist: Array.from({ length: 50 }, (_, i) => ({ bvid: "BV" + i, title: "视频", created: 1791216000 })) } } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCreatorVideos } = await import("@/lib/bilibili/client");
    await expect(fetchCreatorVideos("123", 30, { now: new Date("2026-10-07T02:00:00Z"), pageDelayMs: 0 })).rejects.toMatchObject({ code: -412 });
  });

});

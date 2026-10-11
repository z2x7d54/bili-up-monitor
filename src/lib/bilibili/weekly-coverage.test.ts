import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/bilibili/session", () => ({ getBiliRequestCookie: vi.fn(async () => "test") }));
vi.mock("@/lib/bilibili/wbi", () => ({ signWithLiveWbiKeys: vi.fn(async (params: Record<string, unknown>) => Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]))) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("paginates beyond the current month and recent limit to cover the whole preceding month", async () => {
  const now = new Date("2026-10-05T02:00:00Z");
  const stamp = (value: string) => new Date(value).getTime() / 1000;
  const all = Array.from({ length: 73 }, (_, i) => ({ bvid: `BVweek${i}`, title: `视频${i}`, created: i < 8 ? stamp("2026-10-02T02:00:00Z") : i < 70 ? stamp("2026-09-29T02:00:00Z") : stamp("2026-09-27T02:00:00Z") }));
  const pages: number[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const data = url.pathname.endsWith("arc/search") ? (() => {
      const page = Number(url.searchParams.get("pn")); pages.push(page);
      return { page: { count: all.length }, list: { vlist: all.slice((page - 1) * 50, page * 50) } };
    })() : { stat: { view: 10, like: 1 } };
    return new Response(JSON.stringify({ code: 0, data }), { headers: { "Content-Type": "application/json" } });
  }));
  const { fetchCreatorVideos } = await import("@/lib/bilibili/client");
  const videos = await fetchCreatorVideos("123", 10, { now, pageDelayMs: 0 });
  expect(pages).toEqual([1, 2]);
  expect(videos).toHaveLength(73);
  expect(videos.filter(v => v.publishedAt! < new Date("2026-09-30T16:00:00Z"))).toHaveLength(65);
});

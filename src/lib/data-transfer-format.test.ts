import { describe, expect, it } from "vitest";
import { DATA_FILE_FORMAT, DATA_FILE_LIMIT, parseDataFile, readDataRequest, summarizeData } from "@/lib/data-transfer-format";
import { buildWeeklyReport, buildMonthlyNotificationReport } from "@/lib/weekly";
import { withDataImport, withDataWrite } from "@/lib/data-transfer-lock";

function fixture() {
  const stamp = "2026-10-05T02:00:00.000Z";
  const creator = { id: "a", mid: "123", name: "账号", avatarUrl: null, description: null, groupName: "分组", status: "MONITORING", followingCount: 0, followerCount: 1, likeCount: 0, viewCount: 0, videoCount: 0,
    lastVideoSyncFromAt: null, lastVideoSyncAt: null, videoSyncMonth: null, lastFetchedAt: null, lastFailedAt: null, lastError: null, createdAt: stamp, updatedAt: stamp };
  const report = buildMonthlyNotificationReport([], [], ["分组"], new Date(stamp));
  return { format: DATA_FILE_FORMAT, version: 1, exportedAt: stamp, data: { creators: [creator], groups: [{ name: "分组", description: null, sortOrder: 1, createdAt: stamp, updatedAt: stamp }], contents: [], tasks: [], targets: [], snapshots: [], runs: [],
    notifications: [{ id: "n", kind: "MONTH", weekKey: report.weekKey, periodStart: report.start, periodEnd: report.end, payload: JSON.stringify(report), readAt: stamp, popupSeenAt: stamp, createdAt: stamp }] } };
}
describe("portable data format", () => {
  it("preserves notification contents, read state and one-time popup state", () => {
    const original = fixture(); const file = parseDataFile(JSON.parse(JSON.stringify(original)));
    expect(file.data.notifications).toEqual(original.data.notifications);
    expect(summarizeData(file)).toMatchObject({ accounts: 1, groups: 1, videos: 0, notifications: 1 });
  });
  it("rejects other formats, future versions and credential fields", () => {
    expect(() => parseDataFile({ ...fixture(), format: "other" })).toThrow("格式");
    expect(() => parseDataFile({ ...fixture(), version: 2 })).toThrow("版本");
    expect(() => parseDataFile({ ...fixture(), biliCookie: "secret" })).toThrow("格式");
  });
  it("rejects duplicate accounts by UID even when IDs differ", () => {
    const data = fixture(); data.data.creators.push({ ...data.data.creators[0], id: "b" });
    expect(() => parseDataFile(data)).toThrow("重复");
  });
  it("rejects missing groups and missing task/creator references before import", () => {
    const data = fixture(); data.data.groups = [];
    expect(() => parseDataFile(data)).toThrow("关联数据缺失");
  });
  it("rejects corrupt notification JSON and period mismatch", () => {
    const data = fixture(); data.data.notifications[0].payload = "{";
    expect(() => parseDataFile(data)).toThrow("通知内容损坏");
    const changed = fixture(); changed.data.notifications[0].weekKey = "2026-01-01";
    expect(() => parseDataFile(changed)).toThrow("统计日期");
  });
  it("rejects malformed JSON and streamed payloads above the size limit", async () => {
    await expect(readDataRequest(new Request("http://localhost/import", { method: "POST", body: "{" }))).rejects.toThrow("JSON");
    await expect(readDataRequest(new Request("http://localhost/import", { method: "POST", body: "1234567890" }), 5)).rejects.toThrow("超过");
    expect(await readDataRequest(new Request("http://localhost/import", { method: "POST", body: '{"version":1}' }))).toEqual({ version: 1 });
  });
});
describe("data import coordination", () => {
  it("blocks import during collection and releases the guard afterwards", async () => {
    let release!: () => void;
    const running = withDataWrite(() => new Promise<void>(resolve => { release = resolve; }));
    await expect(withDataImport(async () => true)).rejects.toThrow("正在采集");
    release(); await running;
    expect(await withDataImport(async () => true)).toBe(true);
  });
  it("blocks overlapping imports and collection while importing, including after a failure", async () => {
    let reject!: (error: Error) => void;
    const running = withDataImport(() => new Promise<void>((_, fail) => { reject = fail; }));
    await expect(withDataImport(async () => true)).rejects.toThrow("导入正在进行");
    await expect(withDataWrite(async () => true)).rejects.toThrow("正在导入");
    const failed = expect(running).rejects.toThrow("simulated"); reject(new Error("simulated")); await failed;
    expect(await withDataWrite(async () => true)).toBe(true);
  });
});

describe("targets and monthly history migration", () => {
  it("accepts legacy files without goals or notification kind", () => {
    const legacy = JSON.parse(JSON.stringify(fixture()));
    const report = buildWeeklyReport([], [], ["分组"], new Date(legacy.exportedAt)); delete report.kind;
    legacy.data.notifications[0] = { ...legacy.data.notifications[0],weekKey:report.weekKey,periodStart:report.start,periodEnd:report.end,payload:JSON.stringify(report) };
    delete legacy.data.notifications[0].kind;
    expect(parseDataFile(legacy).data.goals).toEqual([]);
    expect(parseDataFile(legacy).data.notifications).toEqual([]);
  });
  it("preserves monthly reports and targets and rejects invalid target references or values", () => {
    const base = fixture(), stamp = base.exportedAt;
    const month = buildMonthlyNotificationReport([], [], ["分组"], new Date("2026-09-01T02:00:00Z"));
    const data = { ...base, data: { ...base.data, goals: [{ id: "g", creatorId: "a", groupName: null, period: "MONTH", targets: '{"posts":5}', createdAt: stamp, updatedAt: stamp }], notifications: [...base.data.notifications, { ...base.data.notifications[0], id: "m", kind: "MONTH", weekKey: month.weekKey, periodStart: month.start, periodEnd: month.end, payload: JSON.stringify(month) }] } };
    expect(parseDataFile(data).data.notifications[1].payload).toBe(JSON.stringify(month));
    expect(summarizeData(parseDataFile(data)).goals).toBe(1);
    const corrupt = structuredClone(data); corrupt.data.goals[0].creatorId = "missing";
    expect(() => parseDataFile(corrupt)).toThrow("目标的账号");
    corrupt.data.goals[0].creatorId = "a"; corrupt.data.goals[0].targets = '{"posts":-1}';
    expect(() => parseDataFile(corrupt)).toThrow("目标格式");
    const duplicate = structuredClone(data); duplicate.data.goals.push({ ...duplicate.data.goals[0], id: "other" });
    expect(() => parseDataFile(duplicate)).toThrow("重复");
    const wrongKind = structuredClone(data); wrongKind.data.notifications[1].kind = "WEEK";
    expect(() => parseDataFile(wrongKind)).toThrow("通知格式");
  });
});

describe("large data uploads", () => {
  it("keeps the Next proxy limit aligned with the promised 100 MB import limit", async () => {
    const { default: config } = await import("../../next.config");
    expect(config.experimental?.proxyClientMaxBodySize).toBe(DATA_FILE_LIMIT);
  });
  it("accepts JSON above 10 MB and preserves Chinese text across stream chunks", async () => {
    const text = "数据".repeat(2_000_000);
    const json = JSON.stringify({ text });
    const bytes = new TextEncoder().encode(json);
    expect(bytes.byteLength).toBeGreaterThan(10 * 1024 * 1024);
    const request = new Request("http://localhost/import", {
      method: "POST",
      headers: { "content-length": String(bytes.byteLength), "content-type": "application/json" },
      body: new Blob([bytes]),
    });
    expect(await readDataRequest(request)).toEqual({ text });
  });
  it("distinguishes a truncated upload from malformed JSON", async () => {
    const json = '{"version":1}';
    const request = new Request("http://localhost/import", { method: "POST", headers: { "content-length": "1000" }, body: json });
    await expect(readDataRequest(request)).rejects.toThrow("未接收完整");
  });
  it("allows the exact byte limit and enforces it for unknown-length streams", async () => {
    const json = '{"a":1}';
    const limit = new TextEncoder().encode(json).byteLength;
    expect(await readDataRequest(new Request("http://localhost/import", { method: "POST", body: json }), limit)).toEqual({ a: 1 });
    await expect(readDataRequest(new Request("http://localhost/import", { method: "POST", body: json }), limit - 1)).rejects.toThrow("超过");
  });
  it("rejects an oversize declaration before parsing and rejects invalid lengths", async () => {
    const url = "http://localhost/import";
    await expect(readDataRequest(new Request(url, { method: "POST", headers: { "content-length": String(100 * 1024 * 1024 + 1) }, body: "{}" }))).rejects.toThrow("超过");
    for (const value of ["-1", "NaN", "1.5"]) {
      await expect(readDataRequest(new Request(url, { method: "POST", headers: { "content-length": value }, body: "{}" }))).rejects.toThrow("长度不正确");
    }
  });
});

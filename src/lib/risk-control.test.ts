import { describe, expect, it } from "vitest";
import { getRiskControlMessage, isRiskControlMessage } from "@/lib/risk-control";

describe("risk control helpers", () => {
  it("detects Bilibili risk control messages", () => {
    expect(isRiskControlMessage("内容抓取失败：风控校验失败")).toBe(true);
    expect(isRiskControlMessage("请求被拦截")).toBe(true);
    expect(isRiskControlMessage("request was banned")).toBe(true);
    expect(isRiskControlMessage("Bili API error -412")).toBe(true);
  });

  it("ignores normal network errors", () => {
    expect(isRiskControlMessage("fetch failed")).toBe(false);
    expect(isRiskControlMessage(null)).toBe(false);
  });

  it("returns the first risk control message from a list", () => {
    expect(getRiskControlMessage(["fetch failed", "内容抓取失败：风控校验失败"])).toBe("内容抓取失败：风控校验失败");
  });
});

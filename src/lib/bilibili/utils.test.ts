import { describe, expect, it } from "vitest";
import { formatDurationFromSeconds, parseBiliNumber, parseDurationToSeconds, parseUpInput } from "@/lib/bilibili/utils";

describe("bilibili utils", () => {
  it("parses UID from numeric input and space links", () => {
    expect(parseUpInput("546195")).toBe("546195");
    expect(parseUpInput("https://space.bilibili.com/546195/video")).toBe("546195");
    expect(parseUpInput("https://www.bilibili.com/?mid=12345")).toBe("12345");
  });

  it("normalizes Chinese number units", () => {
    expect(parseBiliNumber("1.2万")).toBe(12000);
    expect(parseBiliNumber("3.4亿")).toBe(340000000);
    expect(parseBiliNumber("12,345")).toBe(12345);
    expect(parseBiliNumber("--")).toBe(0);
  });

  it("parses video duration text", () => {
    expect(parseDurationToSeconds("04:31")).toBe(271);
    expect(parseDurationToSeconds("01:02:03")).toBe(3723);
    expect(parseDurationToSeconds("bad")).toBe(0);
  });

  it("formats video duration from seconds", () => {
    expect(formatDurationFromSeconds(271)).toBe("4:31");
    expect(formatDurationFromSeconds(13_681)).toBe("3:48:01");
    expect(formatDurationFromSeconds(0)).toBeNull();
  });
});

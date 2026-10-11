import { describe, expect, it } from "vitest";
import {
  calculateFailureBackoffMinutes,
  calculateNextRunAt,
  shouldRunTask,
} from "@/lib/monitor/scheduling";

describe("monitor scheduling", () => {
  it("calculates next run from interval minutes", () => {
    const now = new Date("2026-05-18T00:00:00.000Z");
    expect(calculateNextRunAt(now, 30).toISOString()).toBe("2026-05-18T00:30:00.000Z");
  });

  it("uses bounded exponential backoff", () => {
    expect(calculateFailureBackoffMinutes(0)).toBe(10);
    expect(calculateFailureBackoffMinutes(3)).toBe(40);
    expect(calculateFailureBackoffMinutes(99)).toBe(240);
  });

  it("does not run paused, running, or future tasks", () => {
    const now = new Date("2026-05-18T00:00:00.000Z");
    expect(shouldRunTask({ status: "ACTIVE", isRunning: false, nextRunAt: null }, now)).toBe(true);
    expect(shouldRunTask({ status: "PAUSED", isRunning: false, nextRunAt: null }, now)).toBe(false);
    expect(shouldRunTask({ status: "ACTIVE", isRunning: true, nextRunAt: null }, now)).toBe(false);
    expect(
      shouldRunTask({ status: "ACTIVE", isRunning: false, nextRunAt: new Date("2026-05-18T00:01:00.000Z") }, now),
    ).toBe(false);
  });
});

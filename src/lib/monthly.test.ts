import { describe, expect, it } from "vitest";
import { businessDates, daysSincePublication, overdueThreshold, publicationState } from "@/lib/monthly";

describe("China calendar boundaries", () => {
  it("rolls the month and day at China midnight rather than UTC midnight", () => {
    const before = businessDates(new Date("2026-09-30T15:59:59Z"));
    const after = businessDates(new Date("2026-09-30T16:00:00Z"));
    expect(before.monthKey).toBe("2026-09");
    expect(after.monthKey).toBe("2026-10");
    expect(after.monthStart.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(after.todayStart.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(after.monthEnd.toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });
  it("counts calendar days across short midnight intervals", () => {
    expect(daysSincePublication(new Date("2026-10-06T15:59:00Z"), new Date("2026-10-06T16:01:00Z"))).toBe(1);
  });
  it("does not mistake incomplete or failed collection for inactivity", () => {
    expect(publicationState({ complete: false, monthCount: 0, lastPublishedAt: new Date("2026-01-01"), overdueDays: 7 }).state).toBe("PENDING");
  });
  it("flags the exact inactivity threshold and separately flags a month without posts", () => {
    const now = new Date("2026-10-07T02:00:00Z");
    expect(publicationState({ complete: true, monthCount: 0, lastPublishedAt: new Date("2026-09-30T02:00:00Z"), overdueDays: 7, now }).state).toBe("OVERDUE");
    expect(publicationState({ complete: true, monthCount: 0, lastPublishedAt: new Date("2026-09-30T02:00:00Z"), overdueDays: 14, now }).state).toBe("NO_MONTH_POSTS");
  });
  it("rejects invalid inactivity thresholds", () => {
    expect(overdueThreshold("0")).toBe(7);
    expect(overdueThreshold("7.2")).toBe(7);
    expect(overdueThreshold("14")).toBe(14);
  });
});

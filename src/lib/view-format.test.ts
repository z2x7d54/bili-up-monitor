import { describe, expect, it } from "vitest";
import { formatReadablePublishTime, formatSignedNumber } from "@/lib/view-format";

describe("formatSignedNumber", () => {
  it("formats missing values as dash", () => {
    expect(formatSignedNumber(null)).toBe("-");
    expect(formatSignedNumber(undefined)).toBe("-");
  });

  it("keeps zero neutral", () => {
    expect(formatSignedNumber(0)).toBe("0");
  });

  it("formats positive and negative compact values", () => {
    expect(formatSignedNumber(1234)).toBe("+1,234");
    expect(formatSignedNumber(-12000)).toBe("-1.2万");
  });
});

describe("formatReadablePublishTime", () => {
  const now = new Date("2026-05-19T10:00:00+08:00");

  it("uses relative labels for recent publish times", () => {
    expect(formatReadablePublishTime(new Date("2026-05-19T08:30:00+08:00"), now)).toBe("今天 08:30");
    expect(formatReadablePublishTime(new Date("2026-05-18T22:15:00+08:00"), now)).toBe("昨天 22:15");
    expect(formatReadablePublishTime(new Date("2026-05-16T12:05:00+08:00"), now)).toBe("3天前 12:05");
  });

  it("uses compact absolute dates for older publish times", () => {
    expect(formatReadablePublishTime(new Date("2026-04-20T09:05:00+08:00"), now)).toBe("04/20 09:05");
    expect(formatReadablePublishTime(new Date("2025-12-20T09:05:00+08:00"), now)).toBe("2025/12/20");
  });

  it("formats missing values as dash", () => {
    expect(formatReadablePublishTime(null, now)).toBe("-");
  });
});

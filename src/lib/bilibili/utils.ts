export function parseUpInput(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error("请输入 UID 或 B 站空间链接");
  }

  if (/^\d+$/.test(value)) {
    return value;
  }

  const decoded = decodeURIComponent(value);
  const match =
    decoded.match(/space\.bilibili\.com\/(\d+)/i) ??
    decoded.match(/[?&]mid=(\d+)/i) ??
    decoded.match(/[?&]uid=(\d+)/i);

  if (!match?.[1]) {
    throw new Error("无法识别 UID，请输入数字 UID 或 space.bilibili.com 链接");
  }

  return match[1];
}

export function normalizeBiliUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http://")) return url.replace("http://", "https://");
  if (url.startsWith("http")) return url;
  return `https:${url.startsWith("/") ? "" : "//"}${url}`;
}

export function biliVideoUrl(bvid: string) {
  return `https://www.bilibili.com/video/${encodeURIComponent(bvid)}`;
}

export function parseBiliNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return 0;

  const text = value.trim().replace(/,/g, "");
  if (!text || text === "--") return 0;

  const numeric = Number.parseFloat(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return 0;

  if (text.includes("亿")) return Math.round(numeric * 100_000_000);
  if (text.includes("万")) return Math.round(numeric * 10_000);
  return Math.round(numeric);
}

export function parseDurationToSeconds(value?: string | null): number {
  if (!value) return 0;
  const parts = value
    .trim()
    .split(":")
    .map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

export function formatDurationFromSeconds(value: number | null | undefined): string | null {
  if (!value || value <= 0) return null;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

export function fromUnixSeconds(value: unknown): Date | null {
  const seconds = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

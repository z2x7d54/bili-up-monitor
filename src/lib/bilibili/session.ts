import { BILI_REQUEST_HEADERS } from "@/lib/constants";
import { ensureSettings } from "@/lib/db";

type AnonymousSession = {
  cookie: string;
  expiresAt: number;
};

let cachedSession: AnonymousSession | null = null;

export async function getAnonymousBiliCookie(fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Date.now();
  if (cachedSession && cachedSession.expiresAt > now) {
    return cachedSession.cookie;
  }

  const response = await fetchImpl("https://api.bilibili.com/x/frontend/finger/spi", {
    headers: BILI_REQUEST_HEADERS,
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: {
      b_3?: string;
      b_4?: string;
    };
  };

  if (!response.ok || payload.code !== 0 || !payload.data?.b_3 || !payload.data?.b_4) {
    throw new Error(payload.message || `获取 B 站匿名会话失败：HTTP ${response.status}`);
  }

  const seconds = Math.floor(now / 1000);
  const cookie = [
    `buvid3=${payload.data.b_3}`,
    `buvid4=${encodeURIComponent(payload.data.b_4)}`,
    `b_nut=${seconds}`,
    "CURRENT_FNVAL=4048",
  ].join("; ");

  cachedSession = {
    cookie,
    expiresAt: now + 12 * 60 * 60 * 1000,
  };

  return cookie;
}

export async function getBiliRequestCookie(fetchImpl: typeof fetch = fetch): Promise<string> {
  const settings = await ensureSettings();
  const configuredCookie = settings.biliCookie?.trim();
  if (configuredCookie) {
    return configuredCookie;
  }

  return getAnonymousBiliCookie(fetchImpl);
}

export function clearAnonymousBiliCookieCache() {
  cachedSession = null;
}

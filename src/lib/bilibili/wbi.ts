import crypto from "node:crypto";
import { BILI_REQUEST_HEADERS } from "@/lib/constants";

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9,
  42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0,
  1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

type WbiKeyCache = {
  imgKey: string;
  subKey: string;
  expiresAt: number;
};

let cachedKeys: WbiKeyCache | null = null;

export function getMixinKey(imgKey: string, subKey: string): string {
  const raw = `${imgKey}${subKey}`;
  return MIXIN_KEY_ENC_TAB.map((index) => raw[index])
    .join("")
    .slice(0, 32);
}

export function signWbiParams(
  params: Record<string, string | number | boolean | undefined | null>,
  imgKey: string,
  subKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Record<string, string> & { w_rid: string } {
  const mixinKey = getMixinKey(imgKey, subKey);
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries({ ...params, wts: nowSeconds })) {
    if (value === undefined || value === null) continue;
    sanitized[key] = String(value).replace(/[!'()*]/g, "");
  }

  const query = Object.keys(sanitized)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(sanitized[key])}`)
    .join("&");

  const wRid = crypto.createHash("md5").update(query + mixinKey).digest("hex");
  return {
    ...sanitized,
    w_rid: wRid,
  };
}

function extractKey(url?: string): string {
  if (!url) return "";
  const fileName = url.split("/").pop() ?? "";
  return fileName.split(".")[0] ?? "";
}

export async function getWbiKeys(fetchImpl: typeof fetch = fetch) {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt > now) return cachedKeys;

  const response = await fetchImpl("https://api.bilibili.com/x/web-interface/nav", {
    headers: BILI_REQUEST_HEADERS,
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: { wbi_img?: { img_url?: string; sub_url?: string } };
  };

  const imgKey = extractKey(payload.data?.wbi_img?.img_url);
  const subKey = extractKey(payload.data?.wbi_img?.sub_url);
  if (!imgKey || !subKey) {
    throw new Error(payload.message || `B 站 WBI key 响应缺少 img_key 或 sub_key：HTTP ${response.status}`);
  }

  cachedKeys = {
    imgKey,
    subKey,
    expiresAt: now + 24 * 60 * 60 * 1000,
  };
  return cachedKeys;
}

export async function signWithLiveWbiKeys(
  params: Record<string, string | number | boolean | undefined | null>,
  fetchImpl: typeof fetch = fetch,
) {
  const keys = await getWbiKeys(fetchImpl);
  return signWbiParams(params, keys.imgKey, keys.subKey);
}

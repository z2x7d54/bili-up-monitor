const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
export function localRequestError(request: Request): string | null {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let local: URL;
  try { local = new URL(`http://${host}`); } catch { return "无效的本地主机地址"; }
  if (!LOCAL_HOSTS.has(local.hostname) || local.username || local.password || local.host !== host.toLowerCase()) return "仅允许从本机地址访问服务";
  if (!new URL(request.url).pathname.startsWith("/api/")) return null;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return "不允许其他网站访问本地接口";
  const origin = request.headers.get("origin");
  if (origin) {
    try { const parsed = new URL(origin); if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol) || parsed.host !== local.host) return "请求来源与本地服务不匹配"; }
    catch { return "请求来源不正确"; }
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const type = request.headers.get("content-type");
    if (type && type.split(";")[0].trim().toLowerCase() !== "application/json") return "写入接口只接受 JSON 数据";
  }
  return null;
}

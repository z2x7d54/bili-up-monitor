import { NextResponse, type NextRequest } from "next/server";
import { localRequestError } from "@/lib/local-request";
export function proxy(request: NextRequest) {
  const error = localRequestError(request);
  if (error) return NextResponse.json({ ok: false, error }, { status: 403 });
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (request.nextUrl.pathname.startsWith("/api/")) response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: "/:path*" };

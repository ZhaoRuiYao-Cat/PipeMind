import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001/api";

/**
 * @param {NextRequest} request - 进入页面的原始请求
 * @returns {Promise<NextResponse>} 放行或重定向响应
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const cookie = request.headers.get("cookie") ?? "";
  const hasRefreshToken = /(^|;\s*)pm_refresh_token=[^;]+/.test(cookie);
  let sessionValid = false;
  try {
    const meResponse = await fetch(`${API_BASE}/auth/me`, {
      headers: { cookie },
    });
    sessionValid = meResponse.ok;
  } catch {
    sessionValid = false;
  }
  const allowed = sessionValid || hasRefreshToken;
  if (pathname === "/") {
    if (allowed) {
      return NextResponse.redirect(new URL("/home", request.url));
    }
    return NextResponse.next();
  }
  if (!allowed) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp|woff2?)$).*)",
  ],
};

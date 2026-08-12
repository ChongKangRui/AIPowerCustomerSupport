import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_SESSION_COOKIE, SECURE_AUTH_SESSION_COOKIE } from "@/lib/session-cookie";

// Next.js 16 renamed Middleware to Proxy; this file replaces the old `middleware.ts`.
// Intentionally an *optimistic* check only — it redirects requests with no session
// cookie and nothing more. Real authorization (role checks, ticket scoping) belongs
// in the pages/Route Handlers themselves, where the DB session can be read.
//
// Cookie names come from lib/session-cookie.ts rather than lib/session.ts —
// that file is Prisma-free so it's safe to import here on the Edge runtime.

export function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has(AUTH_SESSION_COOKIE) ||
    request.cookies.has(SECURE_AUTH_SESSION_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/tickets/:path*",
    "/admin/:path*",
    "/users/:path*",
  ],
};

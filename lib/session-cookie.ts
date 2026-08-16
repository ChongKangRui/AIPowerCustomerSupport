// This file holds only the session cookie naming convention. It has no
// Prisma, no next/headers, and nothing Node-only.
//
// `proxy.ts` runs on the Edge runtime and cannot bundle Node-only
// packages like `pg`. `lib/session.ts` does the real, Node-only session
// work. This file lets both agree on the cookie name, without proxy.ts
// importing Prisma.
const useSecureCookies = process.env.NODE_ENV === "production";

// These match Auth.js' own default cookie names for the database
// session strategy. `auth()` then recognizes sessions created by hand in
// app/api/login as if NextAuth's own sign-in flow had created them.
export const AUTH_SESSION_COOKIE = "authjs.session-token";
export const SECURE_AUTH_SESSION_COOKIE = "__Secure-authjs.session-token";

/** The cookie name in use for the current environment. */
export const SESSION_COOKIE_NAME = useSecureCookies
  ? SECURE_AUTH_SESSION_COOKIE
  : AUTH_SESSION_COOKIE;

export const useSecureSessionCookie = useSecureCookies;

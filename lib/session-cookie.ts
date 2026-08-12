// Just the session cookie *naming* convention — no Prisma, no next/headers,
// no anything Node-only. This file exists so `proxy.ts` (which runs on the
// Edge runtime and can't bundle Node-only packages like `pg`) and
// `lib/session.ts` (which does all the real, Node-only session work) can both
// agree on the cookie name without proxy.ts having to import Prisma.
const useSecureCookies = process.env.NODE_ENV === "production";

// These match Auth.js' own default cookie names for the database session
// strategy, so `auth()` recognizes sessions created by hand in app/api/login
// exactly as if NextAuth's own sign-in flow had created them.
export const AUTH_SESSION_COOKIE = "authjs.session-token";
export const SECURE_AUTH_SESSION_COOKIE = "__Secure-authjs.session-token";

/** The cookie name actually in use for the current environment. */
export const SESSION_COOKIE_NAME = useSecureCookies
  ? SECURE_AUTH_SESSION_COOKIE
  : AUTH_SESSION_COOKIE;

export const useSecureSessionCookie = useSecureCookies;

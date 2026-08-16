import { randomBytes } from "crypto";

import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, useSecureSessionCookie } from "@/lib/session-cookie";

// 15 days. Auth.js' own `session.maxAge` default would normally set this,
// but that default only applies to sessions Auth.js creates through a
// configured provider.
//
// Sign-in here is hand-rolled (see app/api/login), so this constant is
// the real source of truth instead. auth.ts imports it too, so the two
// values never drift apart.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 15;

/**
 * Creates a database `Session` row for `userId` and sets the matching
 * cookie on the outgoing response. Call this only after the code
 * verifies the user's credentials.
 *
 * The database session strategy signs or verifies nothing
 * cryptographically. The "token" is just a long random string, stored in
 * the `Session` table and mirrored in the cookie. Holding that exact
 * value is the credential, the same idea as any classic server-side
 * session id.
 *
 * `auth()` authenticates a request by looking up this same table.
 */
export async function createUserSession(userId: string) {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: { sessionToken, userId, expires },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: useSecureSessionCookie,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/**
 * Deletes the current request's `Session` row, if any, and clears the
 * cookie. Safe to call even when the caller is not logged in.
 */
export async function destroyUserSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    // Uses deleteMany, not delete, so an already-expired or missing
    // token is a no-op. delete would throw a "record not found" error
    // instead.
    await prisma.session.deleteMany({ where: { sessionToken } });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Deletes every `Session` row for `userId`. DELETE /api/users/[id] uses
 * this to invalidate all of a just-deleted user's active sessions right
 * away, instead of waiting for their cookie to expire on its own.
 *
 * Unlike destroyUserSession, this is not scoped to "the current
 * request's session." It is an admin action on someone else's account,
 * so there is no cookie here to read or clear. The targeted browser's
 * cookie simply stops matching any row on its next request, and auth
 * fails normally.
 */
export async function destroyAllUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

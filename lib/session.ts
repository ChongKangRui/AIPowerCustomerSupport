import { randomBytes } from "crypto";

import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, useSecureSessionCookie } from "@/lib/session-cookie";

// 15 days. Auth.js' own `session.maxAge` default would normally govern this,
// but that default only applies to sessions *it* creates via a configured
// provider. Since sign-in here is hand-rolled (see app/api/login), this
// constant is the actual source of truth — auth.ts imports it too, so the
// two never drift apart.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 15;

/**
 * Creates a database `Session` row for `userId` and sets the matching cookie
 * on the outgoing response. Call this only *after* verifying the user's
 * credentials.
 *
 * With the database session strategy there's nothing to cryptographically
 * sign or verify — the "token" is just a long random string, stored in the
 * `Session` table and mirrored in the cookie. Possession of that exact value
 * *is* the credential (same idea as any classic server-side session id).
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
 * Deletes the current request's `Session` row (if any) and clears the
 * cookie. Safe to call even when the caller isn't actually logged in.
 */
export async function destroyUserSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    // deleteMany (not delete) so an already-expired/missing token is a no-op
    // instead of a thrown "record not found" error.
    await prisma.session.deleteMany({ where: { sessionToken } });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

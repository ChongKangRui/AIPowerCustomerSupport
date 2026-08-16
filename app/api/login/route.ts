import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { RateLimiterRes } from "rate-limiter-flexible";

import {
  TooManyRequestsError,
  UnauthorizedError,
  withApiHandler,
} from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import {
  getClientIp,
  getEmailIpKey,
  limiterConsecutiveFailsByEmailAndIp,
  limiterSlowBruteByIp,
  MAX_CONSECUTIVE_FAILS_BY_EMAIL_AND_IP,
  MAX_WRONG_ATTEMPTS_BY_IP_PER_DAY,
  RATE_LIMITING_ENABLED,
} from "@/lib/rate-limiter";
import { createUserSession } from "@/lib/session";
import { loginSchema } from "@/models/auth.model";

// This is a real bcrypt hash of a value nobody will ever type as a password.
// Below, this makes a request for an email that does not exist still pay the same bcrypt.compare cost as one that does.
// Otherwise "no such user" would return noticeably faster than "wrong password", letting an attacker enumerate valid emails purely by timing the response.
const DUMMY_HASH = bcrypt.hashSync("no-such-user-timing-safety", 10);

function retryAfterSecondsFrom(res: RateLimiterRes): number {
  return Math.max(1, Math.round(res.msBeforeNext / 1000));
}

// POST /api/login verifies email and password, then starts a database session.
export const POST = withApiHandler(async (request, _context, log) => {
  const { email, password } = loginSchema.parse(await request.json());
  const ip = getClientIp(request);
  const emailIpKey = getEmailIpKey(email, ip);

  // This is a cheap read-only check first, no write, per the library's own recommended pattern.
  // It checks whether this email+IP, or this IP, is already blocked from an earlier request, before spending a bcrypt compare on this one.
  // `.get()` only returns a row that has not expired yet. An expired block's row reads back as null, the same as no block at all.
  //
  // This must be a strict `consumedPoints > limit` check, not `remainingPoints === 0`.
  // remainingPoints clamps at 0 as soon as consumedPoints merely reaches the limit — for example, exactly 5 of 5 — which happens one attempt before the library's own block logic, inside consume(), actually fires.
  // Using remainingPoints here made this pre-check intercept that boundary attempt itself, before consume() ever ran.
  // So it kept rejecting off the record's original, pre-block expiry forever, and the record never got a chance to actually pass through consume() and either block properly or expire and reset.
  const [emailIpRes, ipRes] = RATE_LIMITING_ENABLED
    ? await Promise.all([
        limiterConsecutiveFailsByEmailAndIp.get(emailIpKey),
        limiterSlowBruteByIp.get(ip),
      ])
    : [null, null];

  if (ipRes && ipRes.consumedPoints > MAX_WRONG_ATTEMPTS_BY_IP_PER_DAY) {
    log.warn({ email, ip }, "login blocked: too many failures from this IP");
    throw new TooManyRequestsError(
      "Too many attempts. Try again later.",
      retryAfterSecondsFrom(ipRes)
    );
  }
  if (
    emailIpRes &&
    emailIpRes.consumedPoints > MAX_CONSECUTIVE_FAILS_BY_EMAIL_AND_IP
  ) {
    log.warn({ email, ip }, "login blocked: too many failures for this account");
    throw new TooManyRequestsError(
      "Too many attempts. Try again later.",
      retryAfterSecondsFrom(emailIpRes)
    );
  }

  // deletedAt: null makes a soft-deleted user (see app/api/users/[id]/route.ts's DELETE) fall straight into the same "no such user" path below as an unrecognized email, for free.
  // No separate branch is needed, and their old credentials silently stop working.
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });

  const isValidPassword = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_HASH
  );

  if (!user || !user.passwordHash || !isValidPassword) {
    // This deliberately uses the same message and status for "no such user" and "wrong password". It never confirms which one it was.
    // Both limiters are consumed for every failure, existing user or not, so an attacker cannot distinguish the two by watching for a rate-limit side effect either.
    if (RATE_LIMITING_ENABLED) {
      try {
        await Promise.all([
          limiterSlowBruteByIp.consume(ip),
          limiterConsecutiveFailsByEmailAndIp.consume(emailIpKey),
        ]);
      } catch (rlRejected) {
        if (rlRejected instanceof Error) throw rlRejected;
        // This attempt itself just tipped a limiter over its limit.
        // In that case the rejection is a RateLimiterRes, not an Error.
        log.warn({ email, ip }, "login failed: rate limit exceeded on this attempt");
        throw new TooManyRequestsError(
          "Too many attempts. Try again later.",
          retryAfterSecondsFrom(rlRejected as RateLimiterRes)
        );
      }
    }

    log.warn({ email }, "login failed");
    throw new UnauthorizedError("Invalid email or password");
  }

  // On a successful login, this clears this email+IP's failure count.
  // Otherwise it would carry over and eventually block a legitimate user who just mistyped their password a few times before getting it right.
  if (RATE_LIMITING_ENABLED && emailIpRes && emailIpRes.consumedPoints > 0) {
    await limiterConsecutiveFailsByEmailAndIp.delete(emailIpKey);
  }

  await createUserSession(user.id);

  log.info({ userId: user.id }, "login succeeded");
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
});

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
} from "@/lib/rate-limiter";
import { createUserSession } from "@/lib/session";
import { loginSchema } from "@/models/auth.model";

// A real bcrypt hash of a value nobody will ever type as a password. Used
// below so a request for an email that doesn't exist still pays the same
// bcrypt.compare cost as one that does — otherwise "no such user" would
// return noticeably faster than "wrong password", letting an attacker
// enumerate valid emails purely by timing the response.
const DUMMY_HASH = bcrypt.hashSync("no-such-user-timing-safety", 10);

function retryAfterSecondsFrom(res: RateLimiterRes): number {
  return Math.max(1, Math.round(res.msBeforeNext / 1000));
}

// POST /api/login — verifies email + password and starts a database session.
export const POST = withApiHandler(async (request, _context, log) => {
  const { email, password } = loginSchema.parse(await request.json());
  const ip = getClientIp(request);
  const emailIpKey = getEmailIpKey(email, ip);

  // Cheap read-only check first (no write, per the library's own recommended
  // pattern) — is this email+IP or this IP already blocked from an earlier
  // request, before we spend a bcrypt compare on this one?
  //
  // Must be a strict `consumedPoints > limit` check, NOT `remainingPoints ===
  // 0` — remainingPoints clamps at 0 as soon as consumedPoints merely
  // *reaches* the limit (e.g. exactly 5/5), which happens one attempt before
  // the library's own block logic (inside consume()) actually fires. Using
  // remainingPoints here made this pre-check intercept that boundary attempt
  // itself, before consume() ever ran — so it kept rejecting off the
  // record's original (pre-block) expiry forever, and the record never got
  // a chance to actually pass through consume() and either block properly
  // or expire and reset.
  // each .get() get the non expire row, meaning if row have expire, 
  // null will be the return
  const [emailIpRes, ipRes] = await Promise.all([
    limiterConsecutiveFailsByEmailAndIp.get(emailIpKey),
    limiterSlowBruteByIp.get(ip),
  ]);

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

  const user = await prisma.user.findUnique({ where: { email } });

  const isValidPassword = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_HASH
  );

  if (!user || !user.passwordHash || !isValidPassword) {
    // Deliberately the same message/status for "no such user" and "wrong
    // password" — never confirm which one it was. Both limiters are
    // consumed for every failure, existing user or not, so an attacker
    // can't distinguish the two by watching for a rate-limit side effect
    // either.
    try {
      await Promise.all([
        limiterSlowBruteByIp.consume(ip),
        limiterConsecutiveFailsByEmailAndIp.consume(emailIpKey),
      ]);
    } catch (rlRejected) {
      if (rlRejected instanceof Error) throw rlRejected;
      // This attempt itself just tipped a limiter over its limit — the
      // rejection is a RateLimiterRes, not an Error, in that case.
      log.warn({ email, ip }, "login failed: rate limit exceeded on this attempt");
      throw new TooManyRequestsError(
        "Too many attempts. Try again later.",
        retryAfterSecondsFrom(rlRejected as RateLimiterRes)
      );
    }

    log.warn({ email }, "login failed");
    throw new UnauthorizedError("Invalid email or password");
  }

  // Successful login — clear this email+IP's failure count so it doesn't
  // carry over and eventually block a legitimate user who just mistyped
  // their password a few times before getting it right.
  if (emailIpRes && emailIpRes.consumedPoints > 0) {
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

import { RateLimiterPrisma } from "rate-limiter-flexible";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

// Login brute-force protection — see tech-stack.md -> Auth for why this
// library/driver (RateLimiterPrisma, Postgres-backed, no Redis) was chosen.
//
// Two independent limiters, both writing into the same `RateLimiterFlexible`
// table (their `keyPrefix` keeps the keyspaces separate — same pattern as
// this library's own documented login-protection recipe):
//
//  - limiterConsecutiveFailsByEmailAndIp: stops one attacker from grinding
//    through passwords for ONE account. Keyed by `email_ip`, so it only ever
//    blocks that specific attacker's attempts against that specific email —
//    it can't be used to lock a real user out by someone else failing their
//    login from a different IP. Deliberately short-lived: `duration` is set
//    equal to `blockDuration`, so a real account's failure count is never
//    remembered any longer than the block itself lasts — fail fewer than 5
//    times and stop, and the count is gone once that same window closes, no
//    separate long "memory" window. This is a weaker defense against a
//    patient, slow-drip attacker who deliberately spaces guesses out to
//    dodge the window, but that tradeoff is intentional here: the IP-based
//    limiter below still catches sustained slow attempts, without risking a
//    real user's own account being remembered as "partially failed" for a
//    long time after they just mistyped a password a couple of times.
//  - limiterSlowBruteByIp: stops one attacker from spraying many different
//    email/password guesses from a single machine. Keyed by IP alone, and
//    deliberately long-lived/never reset on success (unlike the limiter
//    above) — it's fine to punish a suspect machine for a full day; it's not
//    fine to do the same to one person's account.
//
// Values are tuned for a low-traffic portfolio demo, not production load.

// Exported so app/api/login/route.ts's pre-check can tell "at the limit" (a
// `.get()` read before any block has been set) apart from "over the limit"
// (a block is active) — see the comment on that pre-check for why the
// distinction matters.
export const MAX_CONSECUTIVE_FAILS_BY_EMAIL_AND_IP = 10;
const CONSECUTIVE_FAILS_BLOCK_DURATION_SECONDS = 5 * 60; 
const SECONDS_PER_DAY = 60 * 60 * 24;

export const MAX_WRONG_ATTEMPTS_BY_IP_PER_DAY = 50;

// `tableName` must be the Prisma Client property name for the model, i.e.
// camelCase ("rateLimiterFlexible") — NOT the PascalCase model name from the
// schema. The library's default (`opts.tableName || 'RateLimiterFlexible'`)
// assumes the model name itself is the client property, which is only true
// for generators that don't camelCase; Prisma's does, so the default silently
// resolves to `prisma["RateLimiterFlexible"]` (undefined) without this.
const TABLE_NAME = "rateLimiterFlexible";

export const limiterConsecutiveFailsByEmailAndIp = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: TABLE_NAME,
  keyPrefix: "login_fail_consecutive_email_ip",
  points: MAX_CONSECUTIVE_FAILS_BY_EMAIL_AND_IP,
  // Same value as blockDuration on purpose — see the comment above.
  duration: CONSECUTIVE_FAILS_BLOCK_DURATION_SECONDS,
  blockDuration: CONSECUTIVE_FAILS_BLOCK_DURATION_SECONDS,
});

export const limiterSlowBruteByIp = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: TABLE_NAME,
  keyPrefix: "login_fail_slow_ip",
  points: MAX_WRONG_ATTEMPTS_BY_IP_PER_DAY,
  duration: SECONDS_PER_DAY,
  blockDuration: SECONDS_PER_DAY,
});

/** Best-effort client IP — trusts the `x-forwarded-for` header Vercel sets. */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function getEmailIpKey(email: string, ip: string): string {
  return `${email}_${ip}`;
}

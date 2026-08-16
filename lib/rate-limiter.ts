import { RateLimiterPrisma } from "rate-limiter-flexible";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

// Login brute-force protection. Two independent limiters live in this
// file. Both write into the same `RateLimiterFlexible` table. Their
// `keyPrefix` keeps the keyspaces separate.
// See tech-stack.md -> Auth for why this library and driver
// (RateLimiterPrisma, Postgres-backed, no Redis) was chosen.
// The values below suit a low-traffic portfolio demo, not production load.

// Rate limiting runs only in production. This uses the same NODE_ENV
// gate lib/prisma.ts already uses elsewhere.
//
// Local dev and Playwright e2e runs would otherwise trip the same
// limiter repeatedly, through manual retries or a suite that reruns the
// login flow across specs. That would throw 429 errors unrelated to what
// the test actually checks.
// app/api/login/route.ts checks this flag before it touches the
// limiters. No reads or writes hit the RateLimiterFlexible table outside
// production.
export const RATE_LIMITING_ENABLED = process.env.NODE_ENV === "production";

// Exported so app/api/login/route.ts's pre-check can tell "at the limit"
// (a `.get()` read before any block is set) apart from "over the limit"
// (a block is active). See the comment on that pre-check for why the
// difference matters.
export const MAX_CONSECUTIVE_FAILS_BY_EMAIL_AND_IP = 10;
const CONSECUTIVE_FAILS_BLOCK_DURATION_SECONDS = 5 * 60; 
const SECONDS_PER_DAY = 60 * 60 * 24;

export const MAX_WRONG_ATTEMPTS_BY_IP_PER_DAY = 50;

// `tableName` must be the Prisma Client property name for the model.
// That is the camelCase form ("rateLimiterFlexible"), NOT the PascalCase
// model name from the schema.
//
// The library's default (`opts.tableName || 'RateLimiterFlexible'`)
// assumes the model name is also the client property name. That is only
// true for generators that skip camelCasing, and Prisma's generator does
// camelCase. Without this override, the default would silently resolve
// to `prisma["RateLimiterFlexible"]` (undefined).
const TABLE_NAME = "rateLimiterFlexible";

// Stops one attacker from grinding through passwords for ONE account.
//
// This limiter keys on `email_ip`. It only blocks that specific
// attacker's attempts against that specific email. It cannot lock out a
// real user because someone else failed a login from a different IP.
//
// This is deliberately short-lived. `duration` below equals
// `blockDuration`, so the app never remembers a real account's failure
// count longer than the block itself lasts. That is a weaker defense
// against a patient attacker who spaces guesses out to dodge the window.
// The tradeoff is intentional: the IP-based limiter below still catches
// sustained slow attempts. This limiter avoids remembering a real user's
// account as "partially failed" long after one mistyped password.
export const limiterConsecutiveFailsByEmailAndIp = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: TABLE_NAME,
  keyPrefix: "login_fail_consecutive_email_ip",
  points: MAX_CONSECUTIVE_FAILS_BY_EMAIL_AND_IP,
  duration: CONSECUTIVE_FAILS_BLOCK_DURATION_SECONDS,
  blockDuration: CONSECUTIVE_FAILS_BLOCK_DURATION_SECONDS,
});

// Stops one attacker from spraying many different email/password guesses
// from a single machine.
//
// This limiter keys on IP alone. It is deliberately long-lived and never
// resets on a success, unlike the limiter above. Punishing a suspect
// machine for a full day is fine. Punishing one person's account that
// way is not.
export const limiterSlowBruteByIp = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: TABLE_NAME,
  keyPrefix: "login_fail_slow_ip",
  points: MAX_WRONG_ATTEMPTS_BY_IP_PER_DAY,
  duration: SECONDS_PER_DAY,
  blockDuration: SECONDS_PER_DAY,
});

/** Best-effort client IP. Trusts the `x-forwarded-for` header Vercel sets. */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function getEmailIpKey(email: string, ip: string): string {
  return `${email}_${ip}`;
}

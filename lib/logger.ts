import { randomUUID } from "crypto";

import pino from "pino";

import type { Role } from "@/lib/generated/prisma/enums";

const isProduction = process.env.NODE_ENV === "production";

// The single shared Pino instance for the whole app.
//
// Deliberately no `transport` option here: Pino transports (including
// pino-pretty) run in worker threads, and those don't survive Next.js'
// bundling of Route Handlers/Server Actions — this is a well-known pino +
// Next.js gotcha. Instead:
//   - In production this just writes plain JSON lines to stdout. Vercel's
//     log viewer already parses/searches structured JSON natively, so
//     nothing further is needed.
//   - In development, `next dev`'s stdout is piped through the `pino-pretty`
//     CLI as a separate OS process instead (see the `dev` script in
//     package.json) — that keeps the worker-thread machinery outside the
//     Next.js bundle entirely.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  // Drop pid/hostname from every line — noise for a single-instance app.
  base: undefined,
  // ISO8601 strings ("2026-08-11T09:12:03.512Z") instead of raw epoch ms.
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Shape of the authenticated user attached to a request log, if any. */
export type LoggedUser = {
  id: string;
  email: string | null;
  role: Role;
};

export type RequestLogContext = {
  /** Unique id for this request. Auto-generated if not supplied. */
  requestId?: string;
  /** Route/path the request hit, e.g. "/api/tickets/:id". */
  route: string;
  /** HTTP method, e.g. "GET". */
  method: string;
  /** The authenticated caller, or null/omitted for unauthenticated requests. */
  user?: LoggedUser | null;
};

/**
 * Creates a child logger scoped to a single request. Every log line emitted
 * through the returned logger automatically carries requestId/route/method/user,
 * so call sites just log the outcome without repeating that context each time.
 *
 * The initial `.info()` call below IS the "request received" log line — its
 * own timestamp field is the time the server received the request.
 */
export function createRequestLogger({
  route,
  method,
  user = null,
  requestId = randomUUID(),
}: RequestLogContext) {
  const requestLogger = logger.child({
    requestId,
    route,
    method,
    user: user ? { id: user.id, email: user.email, role: user.role } : "anonymous",
  });

  requestLogger.info("Request received");

  return requestLogger;
}

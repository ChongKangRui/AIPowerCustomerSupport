import { randomUUID } from "crypto";

import pino from "pino";

import type { Role } from "@/lib/generated/prisma/enums";

const isProduction = process.env.NODE_ENV === "production";

// The single shared Pino instance for the whole app.
//
// This deliberately sets no `transport` option. Pino transports
// (including pino-pretty) run in worker threads. Those threads do not
// survive Next.js's bundling of Route Handlers and Server Actions — a
// known pino + Next.js problem. Instead:
//   - In production, this writes plain JSON lines to stdout. Vercel's log
//     viewer already parses and searches structured JSON, so nothing more
//     is needed.
//   - In development, `next dev`'s stdout is piped through the
//     `pino-pretty` CLI as a separate OS process (see the `dev` script in
//     package.json). That keeps the worker-thread machinery outside the
//     Next.js bundle.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  // Drops pid/hostname from every line. They are noise for a single-instance app.
  base: undefined,
  // Uses ISO8601 strings ("2026-08-11T09:12:03.512Z") instead of raw epoch ms.
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
  /** The authenticated caller. Null or omitted when the request is unauthenticated. */
  user?: LoggedUser | null;
};

/**
 * Creates a child logger scoped to one request. Every log line from the
 * returned logger automatically carries requestId/route/method/user.
 * Call sites just log the outcome, without repeating that context each
 * time.
 *
 * The `.info()` call below is the "request received" log line. Its
 * timestamp is the time the server received the request.
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

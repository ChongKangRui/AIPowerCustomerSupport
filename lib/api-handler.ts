import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import { auth } from "@/auth";
import { createRequestLogger, type LoggedUser } from "@/lib/logger";

type Logger = ReturnType<typeof createRequestLogger>;

// ---------------------------------------------------------------------------
// Errors — throw these from anywhere inside a route handler to control the
// exact status code/message sent back. Anything else thrown becomes a
// generic 500, so no route needs its own try/catch.
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HttpError";
    this.status = status;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad Request") {
    super(400, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not Found") {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict") {
    super(409, message);
  }
}

export class TooManyRequestsError extends HttpError {
  /** Seconds the client should wait before retrying — sent as `Retry-After`. */
  retryAfterSeconds?: number;

  constructor(message = "Too Many Requests", retryAfterSeconds?: number) {
    super(429, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ---------------------------------------------------------------------------
// withApiHandler
// ---------------------------------------------------------------------------

type ApiHandler<Context> = (
  request: NextRequest,
  context: Context,
  log: Logger
) => Promise<Response> | Response;

/**
 * Wraps a Route Handler export (GET/POST/PATCH/...) with:
 *
 *  1. A request-scoped logger, created once per request and handed to the
 *     handler as its 3rd argument — routes call `log.debug/info/warn(...)`
 *     for their own internal steps instead of creating a logger themselves.
 *     (Next.js Route Handlers have no Express-style (req, res, next) chain
 *     to attach things to `req` with, so this — a higher-order function each
 *     route is wrapped in — is the App Router equivalent of that pattern.)
 *
 *  2. A single try/catch shared by every route: throw `HttpError` (or one of
 *     its subclasses — BadRequestError, NotFoundError, etc.) for a specific
 *     status code + message; a Zod validation error becomes 400 automatically;
 *     anything else unexpected becomes a generic 500. No route needs its own
 *     try/catch.
 *
 * Usage:
 *   export const GET = withApiHandler(async (request, context, log) => {
 *     log.debug("fetching ticket");
 *     const ticket = await getTicket(id);
 *     if (!ticket) throw new NotFoundError("Ticket not found");
 *     return NextResponse.json(ticket);
 *   });
 */

// worth to mention that context represent a small object holding 
// the dynamic URL segment values for that route.
//  E.g. for a file at app/api/tickets/[id]/route.ts, 
// if someone requests /api/tickets/abc123,
//  Next.js calls your GET with
//  context = { params: Promise.resolve({ id: "abc123" }) }. 
// That's how you read abc123 out of the URL.
export function withApiHandler<Context = { params?: Promise<Record<string, string>> }>(
  handler: ApiHandler<Context>
) {
  return async (request: NextRequest, context: Context): Promise<Response> => {
    const start = Date.now();
    const requestId = randomUUID();
    const route = request.nextUrl.pathname;
    const method = request.method;

    // Best-effort — logging must never itself be the reason a request fails.
    const session = await auth().catch(() => null);
    const user: LoggedUser | null = session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? null,
          role: session.user.role,
        }
      : null;

    const log = createRequestLogger({ requestId, route, method, user });

    try {
      const response = await handler(request, context, log);
      response.headers.set("x-request-id", requestId);

      log.info(
        { status: response.status, durationMs: Date.now() - start },
        "Request completed"
      );

      return response;
    } catch (error) {
      const durationMs = Date.now() - start;

      if (error instanceof HttpError) {
        // Expected, route-declared failure (404, 409, etc.) — one line is enough.
        // `err` also carries `.cause` (e.g. the original DB error) when set.
        log.warn(
          { status: error.status, durationMs, err: error },
          "Request failed"
        );
        const headers: Record<string, string> = { "x-request-id": requestId };
        if (error instanceof TooManyRequestsError && error.retryAfterSeconds) {
          headers["Retry-After"] = String(error.retryAfterSeconds);
        }
        return NextResponse.json(
          { error: error.message },
          { status: error.status, headers }
        );
      }

      if (error instanceof ZodError) {
        log.warn(
          { status: 400, durationMs, issues: error.issues },
          "Request failed validation"
        );
        return NextResponse.json(
          { error: "Invalid request", issues: error.issues },
          { status: 400, headers: { "x-request-id": requestId } }
        );
      }

      // Unexpected error — full detail (stack trace, etc.) server-side via
      // `err`, but only a generic message goes back to the client.
      log.error({ err: error, durationMs }, "Unhandled error");
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500, headers: { "x-request-id": requestId } }
      );
    }
  };
}

import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import { auth } from "@/auth";
import { createRequestLogger, type LoggedUser } from "@/lib/logger";

type Logger = ReturnType<typeof createRequestLogger>;

// `auth` has many overloads. NextAuth also uses it as a middleware
// wrapper, a route-handler wrapper, and more, depending on the call.
// ReturnType<> on the raw overloaded type would pick the wrong signature.
//
// This helper calls `auth()` the one way this file uses it: with zero
// arguments. That forces TS to resolve the correct overload at the call
// site. ReturnType<> then extracts that one signature only.
function getSession() {
  return auth();
}
type Session = Awaited<ReturnType<typeof getSession>>;

// ---------------------------------------------------------------------------
// Errors
//
// Throw one of these from inside a route handler to set the exact status
// code and message sent back. Any other thrown value becomes a generic
// 500 response. No route needs its own try/catch.
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
  /** Seconds to wait before the client retries. Sent as the `Retry-After` header. */
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
  log: Logger,
  session: Session
) => Promise<Response> | Response;

/**
 * Wraps a Route Handler export (GET/POST/PATCH/...). It adds three things:
 *
 *  1. A request-scoped logger. The wrapper creates one per request and
 *     passes it to the handler as the 3rd argument. Routes call
 *     `log.debug/info/warn(...)` for their own steps instead of creating a
 *     logger themselves.
 *     Next.js Route Handlers have no Express-style (req, res, next) chain
 *     to attach things to `req`. This wrapper is the App Router version of
 *     that pattern.
 *
 *  2. One shared try/catch for every route. Throw `HttpError` (or a
 *     subclass — BadRequestError, NotFoundError, etc.) to set a specific
 *     status code and message. A Zod validation error becomes 400
 *     automatically. Any other error becomes a generic 500. No route
 *     needs its own try/catch.
 *
 *  3. The session, resolved once here and passed to the handler as the
 *     4th argument. `auth()` runs a real DB query under the database
 *     session strategy — it is not a cheap cookie decode. NextAuth does
 *     not dedupe repeated calls within one request, so resolving it once
 *     here saves every route from fetching its own copy.
 *
 *     This wrapper does not enforce anything by itself. A route that
 *     needs auth still checks the session value it receives. Each route
 *     stays its own authoritative entry point, independent of any
 *     page-level guard.
 *
 *     The lookup is best-effort. A failed lookup resolves to `null`
 *     instead of throwing (see the comment at the call site below). A
 *     route that requires a session still fails closed with 401/403 in
 *     that case. It just cannot tell "no session" apart from a transient
 *     auth-service failure, which used to surface as a plain 500. Keep
 *     this in mind if you debug an unexpected 401.
 *
 * Usage:
 *   export const GET = withApiHandler(async (request, context, log, session) => {
 *     if (!session?.user) throw new UnauthorizedError();
 *     log.debug("fetching ticket");
 *     const ticket = await getTicket(id);
 *     if (!ticket) throw new NotFoundError("Ticket not found");
 *     return NextResponse.json(ticket);
 *   });
 */

// `context` is the small object Next.js passes with the dynamic URL
// segment values for the route.
//
// Example: for app/api/tickets/[id]/route.ts, a request to
// /api/tickets/abc123 calls GET with
// context = { params: Promise.resolve({ id: "abc123" }) }.
// Read `abc123` back out of the URL this way.
export function withApiHandler<Context = { params?: Promise<Record<string, string>> }>(
  handler: ApiHandler<Context>
) {
  return async (request: NextRequest, context: Context): Promise<Response> => {
    const start = Date.now();
    const requestId = randomUUID();
    const route = request.nextUrl.pathname;
    const method = request.method;

    // Best-effort: logging must never cause a request to fail.
    //
    // This is also the only auth() call for the whole request (see point 3
    // in the doc comment above). The wrapper passes the result to the
    // handler below, so no route fetches its own copy.
    const session = await getSession().catch(() => null);
    const user: LoggedUser | null = session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? null,
          role: session.user.role,
        }
      : null;

    const log = createRequestLogger({ requestId, route, method, user });

    try {
      const response = await handler(request, context, log, session);
      response.headers.set("x-request-id", requestId);

      log.info(
        { status: response.status, durationMs: Date.now() - start },
        "Request completed"
      );

      return response;
    } catch (error) {
      const durationMs = Date.now() - start;

      if (error instanceof HttpError) {
        // Expected, route-declared failure (404, 409, etc.). One log line
        // is enough. `err` also carries `.cause` (the original DB error)
        // when set.
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

      // Unexpected error. The full detail (stack trace, etc.) goes to the
      // server log via `err`. Only a generic message goes back to the
      // client.
      log.error({ err: error, durationMs }, "Unhandled error");
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500, headers: { "x-request-id": requestId } }
      );
    }
  };
}

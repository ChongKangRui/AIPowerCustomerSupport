import { describe, it, expect, vi } from "vitest";

// api-handler.ts imports @/auth (for withApiHandler's session lookup), which
// pulls in next-auth -> `import { NextRequest } from "next/server"` with no
// file extension. Next's package.json has no "exports" map, so that bare
// import only resolves under Node's CJS extension-probing — Vitest/vite-node
// loads next-auth as ESM here and the resolution fails. This file only tests
// the plain HttpError class hierarchy (not the auth-dependent parts of
// withApiHandler), so mocking @/auth sidesteps the whole chain instead of
// fighting that resolution gap.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
} from "@/lib/api-handler";

// withApiHandler itself is out of scope here — it needs a real NextRequest,
// auth(), and logger, and belongs to a later integration-style test. This
// file only covers the plain HttpError class hierarchy.

describe("HttpError", () => {
  it("sets status, message, and name", () => {
    const error = new HttpError(418, "I'm a teapot");

    expect(error.status).toBe(418);
    expect(error.message).toBe("I'm a teapot");
    expect(error.name).toBe("HttpError");
    expect(error).toBeInstanceOf(Error);
  });

  it("passes ErrorOptions (e.g. cause) through to Error", () => {
    const cause = new Error("root");
    const error = new HttpError(500, "boom", { cause });

    expect(error.cause).toBe(cause);
  });
});

describe("HttpError subclasses", () => {
  it("BadRequestError defaults to 400 / 'Bad Request'", () => {
    const error = new BadRequestError();

    expect(error.status).toBe(400);
    expect(error.message).toBe("Bad Request");
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toBeInstanceOf(Error);
  });

  it("BadRequestError accepts a custom message", () => {
    expect(new BadRequestError("Missing field").message).toBe("Missing field");
  });

  it("UnauthorizedError defaults to 401 / 'Unauthorized'", () => {
    const error = new UnauthorizedError();

    expect(error.status).toBe(401);
    expect(error.message).toBe("Unauthorized");
  });

  it("ForbiddenError defaults to 403 / 'Forbidden'", () => {
    const error = new ForbiddenError();

    expect(error.status).toBe(403);
    expect(error.message).toBe("Forbidden");
  });

  it("NotFoundError defaults to 404 / 'Not Found'", () => {
    const error = new NotFoundError();

    expect(error.status).toBe(404);
    expect(error.message).toBe("Not Found");
  });

  it("ConflictError defaults to 409 / 'Conflict'", () => {
    const error = new ConflictError();

    expect(error.status).toBe(409);
    expect(error.message).toBe("Conflict");
  });

  it("TooManyRequestsError defaults to 429 / 'Too Many Requests' with no retryAfterSeconds", () => {
    const error = new TooManyRequestsError();

    expect(error.status).toBe(429);
    expect(error.message).toBe("Too Many Requests");
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it("TooManyRequestsError accepts a custom message and retryAfterSeconds", () => {
    const error = new TooManyRequestsError("Slow down", 60);

    expect(error.message).toBe("Slow down");
    expect(error.retryAfterSeconds).toBe(60);
  });
});

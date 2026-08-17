import { describe, expect, it, vi } from "vitest";

// route.ts imports withApiHandler (lib/api-handler.ts), which imports
// @/auth for its session lookup. That import pulls in next-auth, which
// does `import { NextRequest } from "next/server"` with no file
// extension — Next's package.json has no "exports" map, so that bare
// import only resolves under Node's CJS extension-probing, and
// Vitest/vite-node loads next-auth as ESM here. Same gap
// lib/api-handler.test.ts already documents and sidesteps by mocking
// @/auth instead of fighting the resolution chain.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { greetingName, withGreetingAndSignoff } from "./route";

// This file covers only the two pure, no-network functions this route
// exports for exactly this reason. POST itself needs a real NextRequest,
// session, Prisma, and a real (or heavily mocked) Gemini stream — out of
// scope here, same reasoning lib/api-handler.test.ts gives for leaving
// withApiHandler itself untested at the unit layer.

describe("greetingName", () => {
  it("uses the first name when customerName is set", () => {
    expect(greetingName("Ada Lovelace")).toBe("Ada");
  });

  it("uses the whole name when there's no space (a single-word name)", () => {
    expect(greetingName("Cher")).toBe("Cher");
  });

  it("falls back to \"there\" when customerName is null", () => {
    expect(greetingName(null)).toBe("there");
  });
});

// Drains a ReadableStream<string> into one plain string, the same way a
// real HTTP client (or this repo's use-rephrase-reply.ts) would consume
// it chunk by chunk.
async function drain(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}

// Simulates toTextStream({ stream: result.stream }) emitting Gemini's
// text deltas one at a time — the exact shape withGreetingAndSignoff()
// is built to wrap, without ever calling the real model.
function fakeModelStream(chunks: string[]): ReadableStream<string> {
  let i = 0;
  return new ReadableStream<string>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

describe("withGreetingAndSignoff", () => {
  it("wraps the model's chunks with a greeting prefix and sign-off suffix", async () => {
    const wrapped = withGreetingAndSignoff(
      fakeModelStream(["Your refund ", "has been processed."]),
      "Ada Lovelace"
    );

    expect(await drain(wrapped)).toBe(
      "Dear Ada,\n\nYour refund has been processed.\n\nSincerely, \nCustomer Support Agent"
    );
  });

  it("falls back to the \"there\" greeting when customerName is null", async () => {
    const wrapped = withGreetingAndSignoff(fakeModelStream(["We've reset your password."]), null);

    expect(await drain(wrapped)).toBe(
      "Dear there,\n\nWe've reset your password.\n\nSincerely, \nCustomer Support Agent"
    );
  });

  it("still produces a well-formed wrapper around an empty model stream", async () => {
    // Not a realistic case in production — checkAutoResolve's sibling
    // guard is what stops a hollow AI answer from reaching Path A, and
    // this route has no equivalent guard since a human reviews the
    // result before Send. This just locks in that the wrapper itself
    // doesn't throw or produce malformed output on empty input.
    const wrapped = withGreetingAndSignoff(fakeModelStream([]), "Bob");

    expect(await drain(wrapped)).toBe("Dear Bob,\n\n\n\nSincerely, \nCustomer Support Agent");
  });
});

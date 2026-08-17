import { afterEach, describe, expect, it, vi } from "vitest";

// Only generateText is mocked — Output stays real, since it's inert
// here anyway: it's just a value passed into the (mocked) generateText
// call, never actually executed unless the real generateText runs it.
// The real Output.object → NoObjectGeneratedError → fail-open path is
// already verified elsewhere (a throwaway local script against the real
// `ai` package, no network call — see error-log.txt/HOW-IT-WORKS.md §8.1
// for that). What this file covers is checkAutoResolve()'s own
// responsibility: given generateText succeeds or throws for any reason,
// does it return the right thing either way.
const aiMocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: aiMocks.generateText };
});

// geminiFlashLite() throws if GEMINI_API_KEY isn't set (lib/gemini.ts) —
// this test shouldn't depend on local .env state either way, and it
// doesn't matter what "model" checkAutoResolve actually passes along,
// since generateText itself is mocked above and never dispatches a real
// call.
vi.mock("@/lib/gemini", () => ({ geminiFlashLite: () => "mock-model" }));

// getKnowledgeBaseContext() queries Prisma (lib/knowledge-base.ts) — not
// what this file is testing, and a real call would need a DB connection.
const kbMocks = vi.hoisted(() => ({ getKnowledgeBaseContext: vi.fn().mockResolvedValue("mock kb context") }));
vi.mock("@/lib/knowledge-base", () => ({ getKnowledgeBaseContext: kbMocks.getKnowledgeBaseContext }));

import { checkAutoResolve } from "@/lib/ai-auto-resolve";

afterEach(() => vi.clearAllMocks());

describe("checkAutoResolve", () => {
  it("returns the model's output as-is when generateText succeeds", async () => {
    aiMocks.generateText.mockResolvedValue({
      output: { confident: true, response: "Here's how to reset your password..." },
    });

    const result = await checkAutoResolve({ subject: "Forgot password", body: "help" });

    expect(result).toEqual({ confident: true, response: "Here's how to reset your password..." });
  });

  it("fails open to { confident: false, response: \"\" } when generateText throws", async () => {
    // One catch handles every failure mode the same way: a real network
    // error, a bad API key, a 429, or Output.object rejecting a hollow
    // "confident but empty" response (NoObjectGeneratedError) — all of
    // them are just "generateText threw" from this function's point of
    // view. This test uses a generic Error as the stand-in for any of
    // them; which one doesn't change the behavior being tested here.
    aiMocks.generateText.mockRejectedValue(new Error("simulated model failure"));

    const result = await checkAutoResolve({ subject: "App crashes", body: "help" });

    expect(result).toEqual({ confident: false, response: "" });
  });

  it("passes the ticket's subject and body into the prompt, and the KB context into the system prompt", async () => {
    aiMocks.generateText.mockResolvedValue({ output: { confident: false, response: "" } });

    await checkAutoResolve({ subject: "Refund question", body: "Can I get a refund?" });

    expect(aiMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Subject: Refund question\n\nCan I get a refund?",
        system: expect.stringContaining("mock kb context"),
      })
    );
  });
});

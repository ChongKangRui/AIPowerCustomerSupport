import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useRephraseReply } from "@/hooks/use-rephrase-reply";

// Builds a fake fetch() Response whose body streams the given chunks as
// UTF-8 bytes — the same shape app/api/tickets/[id]/rephrase/route.ts's
// real streamed Response has, without ever calling fetch for real.
function streamedResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return { ok: true, body, json: async () => ({}) } as Response;
}

// Builds a fake fetch() Response for the pre-stream failure path —
// withApiHandler's { error } JSON shape, on a route that never started
// streaming (see the route's own comment on why a failure after
// streaming starts can't take this shape instead).
function errorResponse(message: string): Response {
  return { ok: false, body: null, json: async () => ({ error: message }) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRephraseReply", () => {
  it("calls onProgress with the accumulated text as each chunk arrives, then clears isStreaming", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamedResponse(["Dear Ada,\n\n", "Thanks.", "\n\nSincerely,"])));

    const { result } = renderHook(() => useRephraseReply("ticket-1"));
    const progress: string[] = [];

    await act(async () => {
      await result.current.rephrase("thx", (text) => progress.push(text));
    });

    expect(progress).toEqual([
      "Dear Ada,\n\n",
      "Dear Ada,\n\nThanks.",
      "Dear Ada,\n\nThanks.\n\nSincerely,",
    ]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets isStreaming synchronously, before the fetch call has even resolved", () => {
    // A fetch mock that never resolves is fine here — this only checks
    // the state flip that happens on the synchronous part of rephrase(),
    // before its first await. See use-rephrase-reply.ts: setIsStreaming(true)
    // is the very first line inside the async function.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const { result } = renderHook(() => useRephraseReply("ticket-1"));

    act(() => {
      void result.current.rephrase("draft", () => {});
    });

    expect(result.current.isStreaming).toBe(true);
  });

  it("surfaces a pre-stream error from the { error } JSON body, and never calls onProgress", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse("Cannot rephrase a reply on a closed ticket")));

    const { result } = renderHook(() => useRephraseReply("ticket-1"));
    const onProgress = vi.fn();

    await act(async () => {
      await result.current.rephrase("draft", onProgress);
    });

    expect(onProgress).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Cannot rephrase a reply on a closed ticket");
    expect(result.current.isStreaming).toBe(false);
  });

  it("falls back to a generic message when the error response has no JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, body: null, json: async () => { throw new Error("not json"); } } as unknown as Response)
    );

    const { result } = renderHook(() => useRephraseReply("ticket-1"));

    await act(async () => {
      await result.current.rephrase("draft", () => {});
    });

    expect(result.current.error).toBe("Failed to rephrase reply");
  });

  it("POSTs the draft as JSON to the ticket's rephrase endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamedResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRephraseReply("ticket-42"));

    await act(async () => {
      await result.current.rephrase("my draft text", () => {});
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tickets/ticket-42/rephrase",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: "my draft text" }),
      })
    );
  });
});

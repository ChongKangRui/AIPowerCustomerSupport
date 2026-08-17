"use client";

import { useCallback, useState } from "react";

// This backs the ticket detail page's "Rephrase with AI" button
// (components/tickets/ticket-detail-view.tsx), talking to the streaming
// app/api/tickets/[id]/rephrase/route.ts.
//
// This bypasses lib/api-client.ts's shared axios instance on purpose.
// Axios's browser XHR adapter buffers the whole response body — it can't
// surface chunks as they arrive, which is the entire point of streaming
// here. Plain fetch() + response.body's reader is the only way to
// actually see the rewrite appear progressively.
//
// This also isn't a TanStack Query mutation, unlike every other write in
// this app (see hooks/use-send-ticket-reply.ts for that shape). useMutation
// is built around "call once, get one final value" — awkward for a
// stream that updates the UI many times as text arrives. There's also
// nothing to invalidate afterward: rephrasing is pure generation, it
// never touches server/DB state. A small custom hook is the better fit.
export function useRephraseReply(ticketId: string) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rephrase = useCallback(
    async (draft: string, onProgress: (accumulatedText: string) => void) => {
      setIsStreaming(true);
      setError(null);

      try {
        const response = await fetch(`/api/tickets/${ticketId}/rephrase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft }),
        });

        if (!response.ok || !response.body) {
          // Mirrors what lib/api-client.ts's interceptor does for every
          // other route — withApiHandler sends errors as { error: string }
          // JSON — since that interceptor isn't in play here. This only
          // ever fires for a pre-stream failure (auth, closed ticket, a
          // Gemini call that fails before any text streams). A failure
          // after streaming starts can't land here; see the route's own
          // comment on why.
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to rephrase reply");
        }
      
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          onProgress(accumulated);
        
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rephrase reply");
      } finally {
        setIsStreaming(false);
      }
    },
    [ticketId]
  );

  return { rephrase, isStreaming, error };
}

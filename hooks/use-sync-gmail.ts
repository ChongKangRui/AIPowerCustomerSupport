"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

type PollStats = {
  processed: number;
  ticketsCreated: number;
  messagesAppended: number;
  skippedSelfSent: number;
  skippedNotFound: number;
  ticketsReopened: number;
  ignoredClosedReplies: number;
};

// This backs the tickets list toolbar's "Fetch Gmail" button (tickets-view.tsx).
// It is mailbox-wide, not scoped to any one ticket. See POST /api/gmail/poll's comment.
//
// So on success it invalidates the whole ["tickets"] query-key prefix.
// That covers every page, sort, status, and q combination already cached.
// useUpdateTicketStatus and useAssignTicket invalidate a single entry
// instead — this hook can't do that, since PollStats is aggregate counts,
// not a list of which ticket ids actually changed (a poll can touch many:
// new tickets, Phase 4's Path A auto-resolve, Path B round-robin assign,
// or a reopen-on-reply, each a different code path in lib/gmail.ts).
//
// So this invalidates every cached ticket detail too, not just the list.
// That sounds wasteful, but isn't in practice: TanStack Query's default
// refetchType: "active" only refetches queries actively being rendered
// right now, and /tickets/[id] only ever mounts one detail page at a
// time. So this costs at most one extra request — whichever ticket page
// happens to be open, if any — the same cost precise invalidation would
// have, without needing the server to report which ids changed.
export function useSyncGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<PollStats>("/api/gmail/poll").then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

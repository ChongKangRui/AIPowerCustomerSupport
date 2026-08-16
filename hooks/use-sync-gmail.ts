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
// useUpdateTicketStatus and useAssignTicket invalidate a single entry instead — this hook cannot, since it does not know which tickets changed.
export function useSyncGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<PollStats>("/api/gmail/poll").then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

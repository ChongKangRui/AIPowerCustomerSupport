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

// Tickets list toolbar's "Fetch Gmail" button (tickets-view.tsx). Mailbox-
// wide, not scoped to any one ticket — see POST /api/gmail/poll's comment —
// so on success it invalidates the whole ["tickets"] query-key prefix,
// covering every page/sort/status/q combination already cached, rather than
// a single entry the way useUpdateTicketStatus/useAssignTicket do.
export function useSyncGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<PollStats>("/api/gmail/poll").then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

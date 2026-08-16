"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketDetail } from "@/models/ticket.model";

// This is the detail page's reply-box mutation (ticket-detail-view.tsx).
// It has the same shape as useUpdateTicketStatus above.
// It invalidates ["ticket", id], so the new OUTBOUND/AGENT TicketMessage shows up in the conversation thread.
// It also invalidates ["tickets"], in case the list view ever surfaces last-reply info.
export function useSendTicketReply(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) =>
      apiClient.post<TicketDetail>(`/api/tickets/${id}/reply`, { body }).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

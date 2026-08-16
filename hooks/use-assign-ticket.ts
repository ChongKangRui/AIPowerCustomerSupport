"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketDetail } from "@/models/ticket.model";

// This is the ticket detail page's single-ticket assign control.
// components/tickets/ticket-detail-header.tsx uses it, through ticket-detail-view.tsx.
// It uses the same TanStack Query and apiClient pattern, and the same invalidation pair, as useUpdateTicketStatus (hooks/use-update-ticket-status.ts).
export function useAssignTicket(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignedToId: string | null) =>
      apiClient
        .patch<TicketDetail>(`/api/tickets/${id}/assign`, { assignedToId })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

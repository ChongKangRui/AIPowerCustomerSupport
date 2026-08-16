"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

type BulkAssignInput = { ticketIds: string[]; assignedToId: string | null };
type BulkAssignResponse = { count: number };

// This backs the tickets list's assign controls (components/tickets/tickets-view.tsx).
// The bulk "assign N selected" toolbar action and the per-row assign action share this one mutation.
// A single-ticket assign is just `ticketIds: [id]`, so there is no need to duplicate a near-identical hook for each.
//
// This invalidates ["tickets"] only. Nothing calls this from the detail page, so there is no ["ticket", id] entry to invalidate alongside it.
// See useAssignTicket in hooks/use-assign-ticket.ts for that case.
export function useBulkAssignTickets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BulkAssignInput) =>
      apiClient.patch<BulkAssignResponse>("/api/tickets/assign", input).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

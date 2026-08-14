"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

type BulkAssignInput = { ticketIds: string[]; assignedToId: string | null };
type BulkAssignResponse = { count: number };

// Tickets list's assign controls (components/tickets/tickets-view.tsx) —
// both the bulk "assign N selected" toolbar action and the per-row assign
// action share this one mutation (a single-ticket assign is just
// `ticketIds: [id]`), rather than duplicating a near-identical hook for
// each. Invalidates ["tickets"] only — this is never called from the detail
// page, so there's no ["ticket", id] entry to invalidate alongside it (see
// useAssignTicket, hooks/use-assign-ticket.ts, for that case).
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

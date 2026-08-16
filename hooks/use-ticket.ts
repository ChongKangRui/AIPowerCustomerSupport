"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketDetail } from "@/models/ticket.model";

// This is the single-ticket data hook for the detail page (components/tickets/ticket-detail-view.tsx).
// It uses the same TanStack Query and apiClient pattern as useTickets() (hooks/use-tickets.ts), scoped to one row through GET /api/tickets/[id].
//
// queryKey is ["ticket", id], not nested under ["tickets", ...].
// The response shape differs: TicketDetail carries the full message thread, unlike the list's TicketListItem.
// So this is a separate cache entry, not a slice of the list's cache.
export function useTicket(id: string) {
  return useQuery({
    queryKey: ["ticket", id],
    // This forwards the AbortSignal. See hooks/use-current-user.ts for why a queryFn that skips this can serve a stale in-flight response after a refetch — same reasoning as use-tickets.ts's list query.
    queryFn: ({ signal }) =>
      apiClient.get<TicketDetail>(`/api/tickets/${id}`, { signal }).then((res) => res.data),
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketDetail } from "@/models/ticket.model";

// Single-ticket data hook for the detail page
// (components/tickets/ticket-detail-view.tsx) — same TanStack Query +
// apiClient pattern as useTickets() (hooks/use-tickets.ts), just scoped to
// one row via GET /api/tickets/[id]. queryKey is ["ticket", id] rather than
// nested under ["tickets", ...] since it's a different response shape
// (TicketDetail, with the full message thread) than the list's
// TicketListItem, not a slice of the same cache.
export function useTicket(id: string) {
  return useQuery({
    queryKey: ["ticket", id],
    // Forward the AbortSignal — see hooks/use-current-user.ts for why a
    // queryFn that doesn't can serve a stale in-flight response after a
    // refetch (same reasoning as use-tickets.ts's list query).
    queryFn: ({ signal }) =>
      apiClient.get<TicketDetail>(`/api/tickets/${id}`, { signal }).then((res) => res.data),
  });
}

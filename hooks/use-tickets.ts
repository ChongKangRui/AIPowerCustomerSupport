"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketListItem } from "@/models/ticket.model";

type TicketsResponse = { tickets: TicketListItem[] };

// Ticket list data hook — same TanStack Query + apiClient pattern as
// useUsers() (hooks/use-users.ts). Unlike useUsers(), there's no
// client-side re-sort/filter of the response here: the server already
// returns tickets sorted newest-first (see app/api/tickets/route.ts), and
// this dataset is expected to grow unbounded, so that work stays server-side
// rather than repeating Users' in-memory-filter shortcut.
//
// queryKey is an array (not a bare string) so a future
// ["tickets", { status, assignedTo }] for filter params is a small addition
// here, not a restructure.
export function useTickets() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tickets"],
    // Forward the AbortSignal — see use-current-user.ts for why a queryFn
    // that doesn't can serve a stale in-flight response after a refetch.
    queryFn: ({ signal }) =>
      apiClient.get<TicketsResponse>("/api/tickets", { signal }).then((res) => res.data.tickets),
  });

  return { tickets: data ?? [], isLoading, isError, error };
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { TICKET_PAGE_SIZE, type TicketListQuery, type TicketListResponse } from "@/models/ticket.model";

// Ticket list data hook — same TanStack Query + apiClient pattern as
// useUsers() (hooks/use-users.ts). Unlike useUsers(), there's no
// client-side re-sort/filter of the response here: the server does the
// sorting/filtering/pagination (see app/api/tickets/route.ts), and this
// dataset is expected to grow unbounded, so that work stays server-side
// rather than repeating Users' in-memory-filter shortcut.
//
// queryKey includes { page, sortBy, sortDir, status, q } so each distinct
// combination gets its own cache entry — this was previously anticipated in
// this file's comment as a future `["tickets", { status, assignedTo }]`
// extension; status/q (subject search) are now real, assignedTo filtering
// is still a separate later increment. Callers (tickets-view.tsx) are
// expected to have already debounced `q` before it reaches this hook — see
// hooks/use-debounced-value.ts — so typing doesn't fire a request/cache
// entry per keystroke.
export function useTickets({ page, sortBy, sortDir, status, q }: TicketListQuery) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tickets", { page, sortBy, sortDir, status, q }],
    // Forward the AbortSignal — see use-current-user.ts for why a queryFn
    // that doesn't can serve a stale in-flight response after a refetch.
    queryFn: ({ signal }) =>
      apiClient
        .get<TicketListResponse>("/api/tickets", {
          signal,
          params: { page, sortBy, sortDir, status, q },
        })
        .then((res) => res.data),
  });

  return {
    tickets: data?.tickets ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    pageSize: data?.pageSize ?? TICKET_PAGE_SIZE,
    isLoading,
    isError,
    error,
  };
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { TICKET_PAGE_SIZE, type TicketListQuery, type TicketListResponse } from "@/models/ticket.model";

// This is the ticket list data hook.
// It uses the same TanStack Query and apiClient pattern as useUsers() (hooks/use-users.ts).
// Unlike useUsers(), it does not re-sort or re-filter the response on the client.
// The server does the sorting, filtering, and pagination (see app/api/tickets/route.ts).
// This dataset is expected to grow unbounded, so that work stays server-side instead of repeating Users' in-memory-filter shortcut.
//
// queryKey includes { page, sortBy, sortDir, status, q }, so each distinct combination gets its own cache entry.
// status and q (subject search) are live now. assignedTo filtering is a separate, later increment.
//
// Callers, such as tickets-view.tsx, are expected to debounce `q` before it reaches this hook.
// See hooks/use-debounced-value.ts. This stops typing from firing a request and a cache entry per keystroke.
export function useTickets({ page, sortBy, sortDir, status, q }: TicketListQuery) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tickets", { page, sortBy, sortDir, status, q }],
    // This forwards the AbortSignal. See use-current-user.ts for why a queryFn that skips this can serve a stale in-flight response after a refetch.
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

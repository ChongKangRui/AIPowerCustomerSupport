"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { UserListItem } from "@/models/user.model";

type UsersResponse = { users: UserListItem[] };

// Admin-only "Users" page data hook — same TanStack Query + apiClient
// pattern as useCurrentUser (hooks/use-current-user.ts). Fetches the full
// user list once; search/role filtering happens client-side in
// components/users/users-view.tsx rather than as query params here.
//
// `enabled` defaults to true (the Users page's own usage) but lets callers
// that only sometimes need the list — e.g. tickets-view.tsx, which only
// needs it for the assignee dropdown when the current user is an Admin —
// skip the request entirely rather than fetching a list the response won't
// use. GET /api/users itself is still admin-only server-side regardless.
export function useUsers({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users"],
    // Forward the AbortSignal — see use-current-user.ts for why a queryFn
    // that doesn't can serve a stale in-flight response after a refetch.
    queryFn: ({ signal }) =>
      apiClient.get<UsersResponse>("/api/users", { signal }).then((res) => res.data.users),
    enabled,
  });

  return { users: data ?? [], isLoading, isError, error };
}

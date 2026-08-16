"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { UserListItem } from "@/models/user.model";

type UsersResponse = { users: UserListItem[] };

// This is the admin-only "Users" page data hook.
// It uses the same TanStack Query and apiClient pattern as useCurrentUser (hooks/use-current-user.ts).
// It fetches the full user list once. Search and role filtering happen client-side in components/users/users-view.tsx, not as query params here.
//
// `enabled` defaults to true, which matches the Users page's own usage.
// Callers that only sometimes need the list can set it to false.
// One example: tickets-view.tsx only needs the list for the assignee dropdown when the current user is an Admin.
// This lets that caller skip the request instead of fetching a list it will not use.
// GET /api/users itself stays admin-only on the server either way.
export function useUsers({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users"],
    // This forwards the AbortSignal. See use-current-user.ts for why a queryFn that skips this can serve a stale in-flight response after a refetch.
    queryFn: ({ signal }) =>
      apiClient.get<UsersResponse>("/api/users", { signal }).then((res) => res.data.users),
    enabled,
  });

  return { users: data ?? [], isLoading, isError, error };
}

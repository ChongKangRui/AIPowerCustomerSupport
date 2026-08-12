"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { UserListItem } from "@/app/api/users/route";

type UsersResponse = { users: UserListItem[] };

// Admin-only "Users" page data hook — same TanStack Query + apiClient
// pattern as useCurrentUser (hooks/use-current-user.ts). Fetches the full
// user list once; search/role filtering happens client-side in
// components/users/users-view.tsx rather than as query params here.
export function useUsers() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users"],
    queryFn: () =>
      apiClient.get<UsersResponse>("/api/users").then((res) => res.data.users),
  });

  return { users: data ?? [], isLoading, isError, error };
}

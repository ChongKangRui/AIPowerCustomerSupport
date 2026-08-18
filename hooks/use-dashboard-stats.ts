"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { DashboardStats } from "@/models/dashboard.model";

// This is the admin-only "Dashboard" page data hook.
// It uses the same TanStack Query and apiClient pattern as useUsers (hooks/use-users.ts).
// One query, no params — GET /api/dashboard/stats itself stays the admin-only, authoritative gate either way.
export function useDashboardStats() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard-stats"],
    // This forwards the AbortSignal. See use-current-user.ts for why a queryFn that skips this can serve a stale in-flight response after a refetch.
    queryFn: ({ signal }) =>
      apiClient.get<DashboardStats>("/api/dashboard/stats", { signal }).then((res) => res.data),
  });

  // data stays undefined until loaded, not defaulted to a zeroed stats object.
  // That way the view can tell "still loading" apart from "genuinely all zero."
  return { stats: data, isLoading, isError, error };
}

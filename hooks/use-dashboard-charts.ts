"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { DashboardChartPoint } from "@/models/dashboard.model";

type DashboardChartsResponse = { points: DashboardChartPoint[] };

// Same TanStack Query + apiClient pattern as useDashboardStats
// (hooks/use-dashboard-stats.ts). A separate query/route from the stats one
// — stats is a handful of scalars read once, this is a time series, and
// nothing about the two changes together.
export function useDashboardCharts() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard-charts"],
    queryFn: ({ signal }) =>
      apiClient
        .get<DashboardChartsResponse>("/api/dashboard/charts", { signal })
        .then((res) => res.data.points),
  });

  return { points: data ?? [], isLoading, isError, error };
}

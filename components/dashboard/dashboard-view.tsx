"use client";

import { Bot, CheckCircle2, TrendingUp, User, UserCheck, UserX } from "lucide-react";

import { ResolutionRateChart } from "@/components/dashboard/resolution-rate-chart";
import { ResolutionTimeChart } from "@/components/dashboard/resolution-time-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { TicketVolumeChart } from "@/components/dashboard/ticket-volume-chart";
import { useDashboardCharts } from "@/hooks/use-dashboard-charts";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";

// This owns the dashboard's two queries (stats + charts) and layout for
// app/(main)/dashboard/page.tsx: six baseline stat cards, then the three
// Phase 6 trend charts below them.
//
// Stats and charts are separate queries/routes (see hooks/use-dashboard-charts.ts),
// so each section has its own loading/error state rather than one blocking
// the other from rendering.
export function DashboardView() {
  const { stats, isLoading: statsLoading, isError: statsError } = useDashboardStats();
  const { points, isLoading: chartsLoading, isError: chartsError } = useDashboardCharts();

  return (
    <div className="flex flex-col gap-6">
      {statsLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : statsError || !stats ? (
        <p className="text-sm text-destructive">Failed to load dashboard stats.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Active Agents" value={stats.activeAgents} icon={UserCheck} />
          <StatCard label="Inactive Agents" value={stats.inactiveAgents} icon={UserX} />
          <StatCard
            label="Total Tickets Resolved"
            value={stats.totalResolved}
            icon={CheckCircle2}
          />
          <StatCard label="Agent-Resolved" value={stats.agentResolved} icon={User} />
          <StatCard label="AI-Resolved" value={stats.aiResolved} icon={Bot} />
          <StatCard
            label="Avg Tickets / Month"
            value={stats.avgTicketsPerMonth.toFixed(1)}
            icon={TrendingUp}
          />
        </div>
      )}

      {chartsLoading ? (
        <p className="text-sm text-muted-foreground">Loading charts…</p>
      ) : chartsError ? (
        <p className="text-sm text-destructive">Failed to load dashboard charts.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <TicketVolumeChart points={points} />
          <ResolutionRateChart points={points} />
          <ResolutionTimeChart points={points} />
        </div>
      )}
    </div>
  );
}

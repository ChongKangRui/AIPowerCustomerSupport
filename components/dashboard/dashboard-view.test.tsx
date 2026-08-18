import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import type { DashboardChartPoint, DashboardStats } from "@/models/dashboard.model";

const stats: DashboardStats = {
  activeAgents: 3,
  inactiveAgents: 1,
  totalResolved: 42,
  agentResolved: 30,
  aiResolved: 12,
  avgTicketsPerMonth: 7.5,
};

const points: DashboardChartPoint[] = [
  {
    month: "2026-01",
    label: "Jan 26",
    ticketsCreated: 5,
    ticketsResolved: 4,
    agentResolved: 3,
    aiResolved: 1,
    avgResolutionHours: 12,
  },
];

// Same apiClient-mocking approach as components/users/users-view.test.tsx —
// DashboardView pulls in both useDashboardStats() (GET /api/dashboard/stats)
// and useDashboardCharts() (GET /api/dashboard/charts).
const apiClientMocks = vi.hoisted(() => ({
  get: vi.fn((url: string): Promise<{ data: unknown }> => {
    if (url === "/api/dashboard/stats") return Promise.resolve({ data: stats });
    if (url === "/api/dashboard/charts") return Promise.resolve({ data: { points } });
    return Promise.resolve({ data: null });
  }),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: apiClientMocks }));

// Recharts' ResponsiveContainer measures its container via ResizeObserver,
// which jsdom doesn't implement. shadcn's ChartContainer already passes a
// fixed initialDimension fallback for exactly this case (see
// components/ui/chart.tsx), so charts still render without one — this stub
// only exists in case a future recharts version starts requiring the real
// global to exist at all before falling back.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDashboardView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardView />
    </QueryClientProvider>
  );
}

// This covers DashboardView's own job: two independent queries (stats,
// charts), each with its own loading/error/success rendering, wired to the
// right child components. The stat/chart numbers themselves come straight
// from the mocked response — the bucketing math that produces real chart
// points is exhaustively covered on its own in
// lib/dashboard-analytics.test.ts, not re-verified here.
//
// Access control and real seeded-data assertions belong to a real
// authenticated round trip and stay in e2e coverage, not here — same split
// as components/users/users-view.test.tsx.
describe("DashboardView", () => {
  it("renders all six stat cards once stats load", async () => {
    renderDashboardView();

    expect(await screen.findByText("Active Agents")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Inactive Agents")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Total Tickets Resolved")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Agent-Resolved")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("AI-Resolved")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Avg Tickets / Month")).toBeTruthy();
    expect(screen.getByText("7.5")).toBeTruthy();
  });

  it("renders all three chart cards once chart data loads", async () => {
    renderDashboardView();

    expect(await screen.findByText("Ticket Volume")).toBeTruthy();
    expect(screen.getByText("AI vs. Agent Resolved")).toBeTruthy();
    expect(screen.getByText("Resolution Time")).toBeTruthy();
  });

  it("shows a stats error message without blocking the charts section", async () => {
    apiClientMocks.get.mockImplementation((url: string) => {
      if (url === "/api/dashboard/stats") return Promise.reject(new Error("boom"));
      if (url === "/api/dashboard/charts") return Promise.resolve({ data: { points } });
      return Promise.resolve({ data: null });
    });

    renderDashboardView();

    expect(await screen.findByText("Failed to load dashboard stats.")).toBeTruthy();
    expect(await screen.findByText("Ticket Volume")).toBeTruthy();
  });
});

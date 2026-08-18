"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DashboardChartPoint } from "@/models/dashboard.model";

const chartConfig = {
  aiResolved: { label: "AI-Resolved", color: "var(--chart-1)" },
  agentResolved: { label: "Agent-Resolved", color: "var(--chart-2)" },
} satisfies ChartConfig;

// Stacked so the bar's total height is that month's ticketsResolved, split
// by who resolved it. Both series are bucketed by resolvedAt in the API
// route, not createdAt — see models/dashboard.model.ts's DashboardChartPoint
// comment for why that matters.
export function ResolutionRateChart({ points }: { points: DashboardChartPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI vs. Agent Resolved</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="max-h-72 w-full">
          <BarChart data={points}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="aiResolved"
              stackId="resolved"
              fill="var(--color-aiResolved)"
              radius={[0, 0, 4, 4]}
            />
            <Bar
              dataKey="agentResolved"
              stackId="resolved"
              fill="var(--color-agentResolved)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

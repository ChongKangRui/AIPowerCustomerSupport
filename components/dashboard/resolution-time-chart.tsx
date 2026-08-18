"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { DashboardChartPoint } from "@/models/dashboard.model";

const chartConfig = {
  avgResolutionHours: { label: "Avg Resolution Time (hrs)", color: "var(--chart-3)" },
} satisfies ChartConfig;

// Average hours between a ticket's createdAt and resolvedAt, for tickets
// resolved in that month — not tickets created in that month. A month with
// zero resolutions shows 0, same convention as avgTicketsPerMonth in
// GET /api/dashboard/stats.
export function ResolutionTimeChart({ points }: { points: DashboardChartPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolution Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="max-h-72 w-full">
          <LineChart data={points}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              dataKey="avgResolutionHours"
              type="monotone"
              stroke="var(--color-avgResolutionHours)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

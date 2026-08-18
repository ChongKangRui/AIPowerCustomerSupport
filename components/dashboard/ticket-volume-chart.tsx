"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { DashboardChartPoint } from "@/models/dashboard.model";

const chartConfig = {
  ticketsCreated: { label: "Tickets Created", color: "var(--chart-1)" },
} satisfies ChartConfig;

// How many new tickets arrived per month, over the same MONTHS_BACK window
// app/api/dashboard/charts/route.ts always returns.
export function TicketVolumeChart({ points }: { points: DashboardChartPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ticket Volume</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="max-h-72 w-full">
          <BarChart data={points}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="ticketsCreated" fill="var(--color-ticketsCreated)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

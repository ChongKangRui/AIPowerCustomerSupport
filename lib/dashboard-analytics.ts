import type { DashboardChartPoint } from "@/models/dashboard.model";

// Pure date-math and month-bucketing for the Dashboard (Phase 6). Nothing
// here touches Prisma or withApiHandler, on purpose — same reason
// lib/notifications.ts's data builders are plain functions rather than
// living inline in the route files that use them. That import chain
// (withApiHandler -> @/auth -> next-auth) breaks Vitest's module
// resolution unless mocked (see tech-stack.md's Testing gotchas), so
// keeping this logic here instead of in app/api/dashboard/*/route.ts lets
// lib/dashboard-analytics.test.ts import it directly, no mocking needed.

// Calendar months between two dates, inclusive of the current partial
// month, floored at 1 so a same-day/brand-new dataset can't divide by
// zero. e.g. from = Jan 15, to = Mar 3 -> 2 full months elapsed
// (Jan->Feb, Feb->Mar) + the partial current month = 3.
export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
  return Math.max(months, 1);
}

// "YYYY-MM", used as both the bucket map key and a chart point's stable
// sort key.
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type MutableBucket = {
  month: string;
  label: string;
  ticketsCreated: number;
  ticketsResolved: number;
  agentResolved: number;
  aiResolved: number;
  resolutionHoursSum: number;
};

// Pre-fills every month in the window with a zeroed bucket, oldest first,
// so a month with zero tickets still shows up as a real 0 on the chart
// instead of a gap the x-axis silently skips over.
function buildEmptyBuckets(rangeStart: Date, count: number): Map<string, MutableBucket> {
  const buckets = new Map<string, MutableBucket>();

  for (let i = 0; i < count; i++) {
    const date = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
    buckets.set(monthKey(date), {
      month: monthKey(date),
      label: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      ticketsCreated: 0,
      ticketsResolved: 0,
      agentResolved: 0,
      aiResolved: 0,
      resolutionHoursSum: 0,
    });
  }

  return buckets;
}

export type TicketForChart = {
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByAi: boolean;
};

// Buckets a flat ticket list into one DashboardChartPoint per calendar
// month across [rangeStart, rangeStart + monthsBack).
//
// ticketsCreated is bucketed by createdAt. Everything else — resolved
// counts, the AI/agent split, avgResolutionHours — is bucketed by
// resolvedAt instead. A ticket created one month and resolved the next
// lands in different buckets for each, on purpose: see
// models/dashboard.model.ts's DashboardChartPoint comment.
//
// A ticket whose relevant date falls outside the window is silently
// skipped for that metric (the `if (bucket)` / `if (!bucket) continue`
// guards below) rather than throwing — the caller's query is expected to
// already scope to the window, but this stays safe either way, since it's
// also what the unit tests exercise directly without going through that
// query at all.
export function buildChartPoints(
  tickets: TicketForChart[],
  rangeStart: Date,
  monthsBack: number
): DashboardChartPoint[] {
  const buckets = buildEmptyBuckets(rangeStart, monthsBack);

  for (const ticket of tickets) {
    const createdBucket = buckets.get(monthKey(ticket.createdAt));
    if (createdBucket) createdBucket.ticketsCreated += 1;

    if (!ticket.resolvedAt) continue;
    const resolvedBucket = buckets.get(monthKey(ticket.resolvedAt));
    if (!resolvedBucket) continue;

    resolvedBucket.ticketsResolved += 1;
    if (ticket.resolvedByAi) {
      resolvedBucket.aiResolved += 1;
    } else {
      resolvedBucket.agentResolved += 1;
    }
    resolvedBucket.resolutionHoursSum +=
      (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60 * 60);
  }

  return [...buckets.values()].map((bucket) => ({
    month: bucket.month,
    label: bucket.label,
    ticketsCreated: bucket.ticketsCreated,
    ticketsResolved: bucket.ticketsResolved,
    agentResolved: bucket.agentResolved,
    aiResolved: bucket.aiResolved,
    avgResolutionHours:
      bucket.ticketsResolved === 0 ? 0 : bucket.resolutionHoursSum / bucket.ticketsResolved,
  }));
}

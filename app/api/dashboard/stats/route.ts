import { NextResponse } from "next/server";

import { ForbiddenError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { monthsBetween } from "@/lib/dashboard-analytics";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import type { DashboardStats } from "@/models/dashboard.model";

// GET /api/dashboard/stats is admin-only. It returns the six baseline counts for the Dashboard page. It takes no query params — this is a fixed set of global numbers, not a filtered view.
//
// withApiHandler resolves the session but does not enforce anything (same as every other route). So this checks session and role itself, same as GET /api/users, independent of the page-level guard in app/(main)/dashboard/page.tsx.
//
// No groupBy/aggregate call exists anywhere else in this codebase yet. Rather than invent that idiom, this sticks to what GET /api/tickets and GET /api/notifications already do: several independent count queries run in parallel with Promise.all. At this data volume (a portfolio demo) a single fancier query would only save round trips that don't matter here, at the cost of being harder to read.
export const GET = withApiHandler(async (_request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();
  if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

  const [activeAgents, inactiveAgents, totalResolved, agentResolved, aiResolved, ticketAggregate] =
    await Promise.all([
      prisma.user.count({ where: { role: Role.AGENT, deletedAt: null } }),
      prisma.user.count({ where: { role: Role.AGENT, deletedAt: { not: null } } }),

      // resolvedAt IS NOT NULL, not status: RESOLVED. A ticket can go OPEN -> CLOSED directly without ever passing through RESOLVED (see app/api/tickets/[id]/route.ts's ALLOWED_TRANSITIONS), and resolvedAt is only stamped when a transition's nextStatus is RESOLVED.
      // So resolvedAt is the one true "was ever resolved" signal, independent of the ticket's current status.
      prisma.ticket.count({ where: { resolvedAt: { not: null } } }),
      prisma.ticket.count({ where: { resolvedAt: { not: null }, resolvedByAi: false } }),
      prisma.ticket.count({ where: { resolvedAt: { not: null }, resolvedByAi: true } }),

      // One aggregate gets both the all-time ticket count and the earliest createdAt, for the "avg tickets per month" figure below.
      // The month-span math itself happens in monthsBetween() (lib/dashboard-analytics.ts) — this app has no raw SQL queries anywhere, and this is not worth becoming the first one.
      prisma.ticket.aggregate({ _count: true, _min: { createdAt: true } }),
    ]);

  const totalTickets = ticketAggregate._count;
  const earliestCreatedAt = ticketAggregate._min.createdAt;

  // No tickets yet: show 0 rather than dividing by a month count that has no real meaning without at least one ticket to anchor it.
  const avgTicketsPerMonth =
    totalTickets === 0 || !earliestCreatedAt
      ? 0
      : totalTickets / monthsBetween(earliestCreatedAt, new Date());

  const stats: DashboardStats = {
    activeAgents,
    inactiveAgents,
    totalResolved,
    agentResolved,
    aiResolved,
    avgTicketsPerMonth,
  };

  log.info(stats, "fetched dashboard stats");

  // This is a flat DashboardStats object, not wrapped in { stats: {...} } like GET /api/users wraps { users }.
  // Those routes wrap because they return more than one logical thing (a list plus its own metadata).
  // This route returns exactly one logical thing, so a wrapper key would just be an extra unwrap for nothing.
  return NextResponse.json(stats);
});

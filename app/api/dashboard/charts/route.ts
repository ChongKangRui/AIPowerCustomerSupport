import { NextResponse } from "next/server";

import { ForbiddenError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { buildChartPoints } from "@/lib/dashboard-analytics";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";

// GET /api/dashboard/charts is admin-only. It returns one point per calendar
// month, oldest first, for the three Phase 6 trend charts (ticket volume,
// AI-vs-agent resolve rate, average resolution time). Same auth shape as
// GET /api/dashboard/stats: withApiHandler resolves the session but doesn't
// enforce anything, so this checks it independently.
//
// This fetches every ticket touching the window in one query, then hands it
// to buildChartPoints() (lib/dashboard-analytics.ts) to bucket by month in
// JS. Postgres can bucket dates itself with date_trunc, but that needs a raw
// query — this app has none anywhere, and MONTHS_BACK worth of tickets is
// nowhere near enough rows for it to matter at this scale. See
// app/api/tickets/route.ts's buildOrderBy comment for the same "avoid the
// first raw-SQL/dynamic-key precedent" reasoning elsewhere in this codebase.
//
// The bucketing itself lives in lib/, not here, so it can be unit-tested
// directly — see lib/dashboard-analytics.ts's header comment for why.
const MONTHS_BACK = 6;

export const GET = withApiHandler(async (_request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();
  if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

  const now = new Date();
  // Start of the month, (MONTHS_BACK - 1) months back. With MONTHS_BACK = 6
  // and "now" in March, that's October 1st — six buckets total: Oct through
  // March, the last one being the current, still-partial month.
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);

  // A ticket can be created before rangeStart and still resolve inside it
  // (or vice versa isn't possible — resolvedAt is always >= createdAt) — so
  // this OR pulls in anything relevant to either axis, not just one.
  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [{ createdAt: { gte: rangeStart } }, { resolvedAt: { gte: rangeStart } }],
    },
    select: { createdAt: true, resolvedAt: true, resolvedByAi: true },
  });

  const points = buildChartPoints(tickets, rangeStart, MONTHS_BACK);

  log.info({ months: points.length }, "fetched dashboard chart points");
  return NextResponse.json({ points });
});

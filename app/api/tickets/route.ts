import { NextResponse } from "next/server";

import { UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";

// GET /api/tickets — any authenticated user (Admin or Agent). Returns the
// ticket list, scoped by role. No page-level role redirect exists for
// app/(main)/tickets/page.tsx (unlike the admin-only Users page) — this
// route's `where` clause below is the sole authoritative enforcement of
// "Agents only see their own assigned tickets", independent of any UI guard,
// same "route is its own entry point" rationale as GET /api/users.
//
// orderBy is deliberately server-side (newest first) rather than fetched-
// then-sorted client-side like components/users/filter-users.ts does for
// Users — see that file's comment: Users' client-side approach is a
// scale-appropriate shortcut for a handful of accounts, while the ticket
// list is expected to grow unbounded, so sorting (and eventually filtering)
// belongs on the server. No query params yet (no status/assignedTo filter
// UI this round) — a future filter query-param schema would live in
// models/ticket.model.ts, alongside the TicketListItem type already there.
export const GET = withApiHandler(async (_request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();

  const where =
    session.user.role === Role.ADMIN ? {} : { assignedToId: session.user.id };

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      subject: true,
      status: true,
      customerEmail: true,
      customerName: true,
      resolvedByAi: true,
      createdAt: true,
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  log.info({ count: tickets.length, role: session.user.role }, "fetched ticket list");
  return NextResponse.json({ tickets });
});

// No POST here — tickets are created from inbound Gmail messages
// (lib/gmail.ts's processMessage()), not through this API.

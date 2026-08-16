import { NextResponse } from "next/server";

import { UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import type { TicketOrderByWithRelationInput, TicketWhereInput } from "@/lib/generated/prisma/models";
import {
  ticketListQuerySchema,
  TICKET_PAGE_SIZE,
  type TicketSortableField,
} from "@/models/ticket.model";

// This is an explicit allow-list, mapping each valid `sortBy` to its Prisma `orderBy` shape.
// It is built fresh per request, from the already-validated (z.enum'd) sortBy and sortDir.
//
// This deliberately avoids `{ [sortBy]: sortDir }`.
// Prisma's typed query builder never splices this into raw SQL text — there is no $queryRaw or $queryRawUnsafe anywhere in this feature, so classic SQL injection is not reachable here either way.
// But handing a request-derived string to a query builder as a dynamic object key is still the wrong pattern.
// A switch statement here makes it structurally impossible for a future edit to that value's origin to regress this into an actually unsafe access.
function buildOrderBy(
  sortBy: TicketSortableField,
  sortDir: "asc" | "desc"
): TicketOrderByWithRelationInput {
  switch (sortBy) {
    case "subject":
      return { subject: sortDir };
    case "status":
      return { status: sortDir };
    case "createdAt":
      return { createdAt: sortDir };
  }
}

// GET /api/tickets works for any authenticated user, Admin or Agent.
// It returns a page of the ticket list, scoped by role and sorted, filtered, and paginated server-side.
//
// app/(main)/tickets/page.tsx has no page-level role redirect, unlike the admin-only Users page.
// This route's `where` clause below is the sole authoritative enforcement of "Agents only see their own assigned tickets", independent of any UI guard.
// This is the same "route is its own entry point" rationale as GET /api/users.
//
// Sorting, filtering, and pagination are deliberately server-side here, not fetched-then-filtered client-side like components/users/filter-users.ts does for Users.
// See that file's comment: Users' client-side approach is a scale-appropriate shortcut for a handful of accounts, while the ticket list is expected to grow unbounded.
export const GET = withApiHandler(async (request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();

  // page, sortBy, sortDir, status, and q come from ticketListQuerySchema (models/ticket.model.ts).
  // See that schema's comment for why bad values fall back to defaults instead of returning a 400 error, and for the sortBy/status allow-lists that are the actual sanitization boundary for buildOrderBy() and the status clause below.
  const { page, sortBy, sortDir, status, q } = ticketListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams)
  );

  // status and q (subject search) filter the role-scoped set further.
  // This builds an explicit object here, instead of mutating `where` in place, so each clause's presence is a one-line, easy-to-audit condition.
  //
  // assignedToId filtering — a specific agent, picked from a dropdown — is still a separate, later increment.
  // status and subject search are what is live this round.
  const where: TicketWhereInput = {
    ...(session.user.role === Role.ADMIN ? {} : { assignedToId: session.user.id }),
    ...(status === "ALL" ? {} : { status }),
    // mode: "insensitive" needs the Postgres provider, which this project uses. See tech-stack.md's Database & ORM section.
    ...(q ? { subject: { contains: q, mode: "insensitive" } } : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
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
      orderBy: buildOrderBy(sortBy, sortDir),
      skip: (page - 1) * TICKET_PAGE_SIZE,
      take: TICKET_PAGE_SIZE,
    }),
    prisma.ticket.count({ where }),
  ]);

  log.info(
    { count: tickets.length, total, page, sortBy, sortDir, status, q, role: session.user.role },
    "fetched ticket list"
  );
  return NextResponse.json({ tickets, total, page, pageSize: TICKET_PAGE_SIZE });
});

// This file has no POST. Tickets are created from inbound Gmail messages, through lib/gmail.ts's processMessage(), not through this API.

import { NextResponse } from "next/server";

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  withApiHandler,
} from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { Role, TicketStatus } from "@/lib/generated/prisma/enums";
import { bulkAssignTicketsSchema } from "@/models/ticket.model";

// PATCH /api/tickets/assign — admin-only bulk assignment, driven by the
// tickets list's multi-select toolbar (components/tickets/tickets-view.tsx).
// Same eligibility rule as the single-ticket .../[id]/assign/route.ts: only
// OPEN tickets are assignable. All-or-nothing — if any requested ticket
// isn't OPEN (or doesn't exist), the whole batch 409s/404s rather than
// silently assigning a subset. The client already prevents selecting
// non-OPEN rows (use-tickets-table.tsx's enableRowSelection), so this is a
// race-condition backstop, not the normal path.
export const PATCH = withApiHandler(async (request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();
  if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

  const { ticketIds, assignedToId } = bulkAssignTicketsSchema.parse(await request.json());

  if (assignedToId) {
    const assignee = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, deletedAt: true },
    });
    if (!assignee || assignee.deletedAt) throw new BadRequestError("Assignee not found");
  }

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, status: true },
  });
  if (tickets.length !== ticketIds.length) throw new NotFoundError("One or more tickets not found");

  const notOpen = tickets.filter((ticket) => ticket.status !== TicketStatus.OPEN);
  if (notOpen.length > 0) {
    throw new ConflictError(
      `${notOpen.length} of the selected tickets are not open and can't be assigned`
    );
  }

  await prisma.ticket.updateMany({
    where: { id: { in: ticketIds } },
    data: { assignedToId },
  });

  log.info({ ticketIds, assignedToId, count: ticketIds.length }, "bulk assigned tickets");
  return NextResponse.json({ count: ticketIds.length });
});

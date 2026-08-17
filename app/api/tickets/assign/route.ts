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
import { assignmentNotificationData } from "@/lib/notifications";

// PATCH /api/tickets/assign is admin-only bulk assignment, driven by the tickets list's multi-select toolbar (components/tickets/tickets-view.tsx).
// It has the same eligibility rule as the single-ticket .../[id]/assign/route.ts: only OPEN tickets are assignable.
//
// This is all-or-nothing. If any requested ticket is not OPEN, or does not exist, the whole batch returns a 409 or 404 error, instead of silently assigning a subset.
// The client already prevents selecting non-OPEN rows (use-tickets-table.tsx's enableRowSelection), so this check is a race-condition backstop, not the normal path.
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
    select: { id: true, status: true, subject: true, assignedToId: true },
  });
  if (tickets.length !== ticketIds.length) throw new NotFoundError("One or more tickets not found");

  const notOpen = tickets.filter((ticket) => ticket.status !== TicketStatus.OPEN);
  if (notOpen.length > 0) {
    throw new ConflictError(
      `${notOpen.length} of the selected tickets are not open and can't be assigned`
    );
  }

  // Same guards as the single-ticket route (.../[id]/assign): only
  // notify for tickets this actually hands to someone new, and never
  // when an admin bulk-assigns to themselves.
  const changedTickets =
    assignedToId && assignedToId !== session.user.id
      ? tickets.filter((ticket) => ticket.assignedToId !== assignedToId)
      : [];

  await prisma.$transaction([
    prisma.ticket.updateMany({ where: { id: { in: ticketIds } }, data: { assignedToId } }),
    ...changedTickets.map((ticket) =>
      prisma.notification.create({
        data: assignmentNotificationData(assignedToId!, ticket.id, ticket.subject),
      })
    ),
  ]);

  log.info({ ticketIds, assignedToId, count: ticketIds.length }, "bulk assigned tickets");
  return NextResponse.json({ count: ticketIds.length });
});

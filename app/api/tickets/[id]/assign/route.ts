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
import { assignTicketSchema, ticketDetailSelect } from "@/models/ticket.model";
import { assignmentNotificationData } from "@/lib/notifications";

// PATCH /api/tickets/[id]/assign is admin-only manual assignment for a single ticket.
//
// Unlike GET/PATCH .../route.ts, there is no findScopedTicket-style agent visibility scoping here.
// Only Admins can call this at all, and an Admin can already see and act on any ticket, so a plain findUnique is enough.
//
// assignedToId: null unassigns.
// Only OPEN tickets are assignable, enforced here as the actual boundary, and mirrored client-side only for UX (components/tickets/use-tickets-table.tsx, ticket-detail-header.tsx).
export const PATCH = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();
    if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

    const { id } = await context.params;
    const { assignedToId } = assignTicketSchema.parse(await request.json());

    const existing = await prisma.ticket.findUnique({
      where: { id },
      select: { status: true, subject: true, assignedToId: true },
    });
    if (!existing) throw new NotFoundError("Ticket not found");
    if (existing.status !== TicketStatus.OPEN) {
      throw new ConflictError("Only open tickets can be assigned");
    }

    if (assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { id: true, deletedAt: true },
      });
      if (!assignee || assignee.deletedAt) throw new BadRequestError("Assignee not found");
    }

    // Only notify on a real handoff — skip a no-op re-PATCH (same
    // assignedToId) and skip self-assignment (admin already knows).
    const notifyAssignee =
      assignedToId &&
      assignedToId !== existing.assignedToId &&
      assignedToId !== session.user.id;

    const [ticket] = await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data: { assignedToId }, select: ticketDetailSelect }),
      ...(notifyAssignee
        ? [
            prisma.notification.create({
              data: assignmentNotificationData(assignedToId, id, existing.subject),
            }),
          ]
        : []),
    ]);

    log.info({ ticketId: id, assignedToId }, "assigned ticket");
    return NextResponse.json(ticket);
  }
);

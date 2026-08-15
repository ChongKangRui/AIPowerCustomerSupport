import { NextResponse } from "next/server";

import { ConflictError, NotFoundError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { findScopedTicket } from "@/lib/ticket-access";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import { ticketDetailSelect, updateTicketStatusSchema } from "@/models/ticket.model";

// GET /api/tickets/[id] — any authenticated user (Admin or Agent), scoped
// per findScopedTicket (lib/ticket-access.ts, shared with the sibling reply
// route). Returns the full TicketDetail: metadata plus the ordered
// conversation thread, for the detail page
// (components/tickets/ticket-detail-view.tsx).
export const GET = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (_request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;
    const ticket = await findScopedTicket(id, session, ticketDetailSelect);
    if (!ticket) throw new NotFoundError("Ticket not found");

    log.info({ ticketId: id }, "fetched ticket detail");
    return NextResponse.json(ticket);
  }
);

// Status transitions the detail page's Mark Resolved/Close actions are
// allowed to make. CLOSED has no outgoing edges at all — it's terminal (see
// project-scope.md: "cannot be reopened" — not even by an agent). Kept as an
// explicit allow-list (not e.g. "anything but the current status") for the
// same reason app/api/tickets/route.ts's buildOrderBy() is a switch instead
// of a dynamic lookup: the set of legal moves should be structurally
// obvious here, not inferred.
const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

// PATCH /api/tickets/[id] — status-only mutation, same auth/scoping as GET.
// No reply/outbound-email support here (see the ticket-detail-page plan —
// building a real Gmail send is separate, later scope); this only ever
// flips `status` and stamps the matching `resolvedAt`/`closedAt`.
export const PATCH = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;
    const { status: nextStatus } = updateTicketStatusSchema.parse(await request.json());

    const existing = await findScopedTicket(id, session, ticketDetailSelect);
    if (!existing) throw new NotFoundError("Ticket not found");

    if (!ALLOWED_TRANSITIONS[existing.status].includes(nextStatus)) {
      throw new ConflictError(`Cannot move a ${existing.status} ticket to ${nextStatus}`);
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(nextStatus === TicketStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
        ...(nextStatus === TicketStatus.CLOSED ? { closedAt: new Date() } : {}),
      },
      select: ticketDetailSelect,
    });

    log.info({ ticketId: id, from: existing.status, to: nextStatus }, "updated ticket status");
    return NextResponse.json(ticket);
  }
);

import { NextResponse } from "next/server";

import { ConflictError, NotFoundError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { Role, TicketStatus } from "@/lib/generated/prisma/enums";
import type { Session } from "next-auth";
import { updateTicketStatusSchema } from "@/models/ticket.model";

// Same `select` shape for both GET and PATCH's response — a single source
// of truth for what TicketDetail (models/ticket.model.ts) actually contains
// on the wire, so the two handlers below can't quietly drift apart.
const ticketDetailSelect = {
  id: true,
  subject: true,
  status: true,
  customerEmail: true,
  customerName: true,
  assignedTo: { select: { id: true, name: true } },
  resolvedByAi: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  summary: true,
  category: true,
  sentiment: true,
  messages: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      direction: true,
      authorType: true,
      author: { select: { id: true, name: true } },
      body: true,
      createdAt: true,
    },
  },
};

// Shared by GET and PATCH — mirrors GET /api/tickets's `where` scoping
// (app/api/tickets/route.ts): Admins can load any ticket, Agents only their
// own assigned one. Returning null (→ 404) rather than 403 for "exists but
// not yours" is deliberate, same rationale as that route's own comment —
// this route is its own authoritative entry point, independent of any
// page-level guard, and a 404 doesn't confirm/deny another agent's ticket
// exists.
async function findScopedTicket(id: string, session: NonNullable<Session>) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: ticketDetailSelect,
  });
  if (!ticket) return null;
  if (session.user.role !== Role.ADMIN && ticket.assignedTo?.id !== session.user.id) {
    return null;
  }
  return ticket;
}

// GET /api/tickets/[id] — any authenticated user (Admin or Agent), scoped
// per findScopedTicket above. Returns the full TicketDetail: metadata plus
// the ordered conversation thread, for the detail page
// (components/tickets/ticket-detail-view.tsx).
export const GET = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (_request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;
    const ticket = await findScopedTicket(id, session);
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

    const existing = await findScopedTicket(id, session);
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

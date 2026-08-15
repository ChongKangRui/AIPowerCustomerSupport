import type { Session } from "next-auth";

import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import type { TicketGetPayload, TicketSelect } from "@/lib/generated/prisma/models";

// Shared visibility rule for loading a single ticket by id: Admins can load
// any ticket, Agents only their own assigned one. Returning null (→
// NotFoundError, 404) rather than throwing/403 for "exists but not yours" is
// deliberate — this is the sole authoritative scoping check for every route
// that loads one ticket, and a 404 doesn't confirm/deny another agent's
// ticket exists. Used by GET/PATCH app/api/tickets/[id]/route.ts and POST
// app/api/tickets/[id]/reply/route.ts.
//
// `select` is a required parameter rather than fixed to ticketDetailSelect —
// callers need different shapes back (the reply route also needs
// gmailThreadId to send through Gmail, which ticketDetailSelect doesn't
// include), so the caller passes whatever select it needs and gets that
// shape back, typed via Prisma's own TicketGetPayload. The `assignedTo`
// bound on Select is the one thing every caller's select must include —
// that's what the scoping check itself reads.
export async function findScopedTicket<
  Select extends TicketSelect & { assignedTo: { select: { id: true } } },
>(
  id: string,
  session: NonNullable<Session>,
  select: Select
): Promise<TicketGetPayload<{ select: Select }> | null> {
  const ticket = await prisma.ticket.findUnique({ where: { id }, select });
  if (!ticket) return null;

  // TypeScript can't narrow `assignedTo` off the generic Select param alone
  // (the mapped-type result stays opaque until Select is a concrete
  // literal) — this cast is sound because every caller's Select is
  // constrained above to include `assignedTo: { select: { id: true } } }`.
  const assignedTo = (ticket as { assignedTo: { id: string } | null }).assignedTo;
  if (session.user.role !== Role.ADMIN && assignedTo?.id !== session.user.id) {
    return null;
  }
  return ticket;
}

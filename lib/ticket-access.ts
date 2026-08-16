import type { Session } from "next-auth";

import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import type { TicketGetPayload, TicketSelect } from "@/lib/generated/prisma/models";

// Shared visibility rule for loading one ticket by id. Admins can load
// any ticket. Agents can load only their own assigned ticket. GET/PATCH
// app/api/tickets/[id]/route.ts and POST
// app/api/tickets/[id]/reply/route.ts all use this rule.
//
// A ticket that exists but is not yours returns null, which becomes a
// 404 (NotFoundError), not a 403. This is deliberate: this function is
// the one authoritative scoping check for every route that loads one
// ticket. A 404 does not confirm or deny that another agent's ticket
// exists.
export async function findScopedTicket<
  // Every caller's select must include `assignedTo`. The scoping check
  // below reads that field.
  Select extends TicketSelect & { assignedTo: { select: { id: true } } },
>(
  id: string,
  session: NonNullable<Session>,
  // `select` is required, not fixed to one shared shape, because callers
  // need different fields back. The reply route also needs gmailThreadId
  // to send through Gmail; the ticket detail page's select does not
  // include that field. Each caller gets back exactly the shape it asked
  // for, typed through Prisma's own TicketGetPayload.
  select: Select
): Promise<TicketGetPayload<{ select: Select }> | null> {
  const ticket = await prisma.ticket.findUnique({ where: { id }, select });
  if (!ticket) return null;

  // TypeScript cannot narrow `assignedTo` from the generic Select param
  // alone. The mapped-type result stays opaque until Select becomes a
  // concrete literal. This cast is still sound: the Select constraint
  // above forces every caller to include
  // `assignedTo: { select: { id: true } } }`.
  const assignedTo = (ticket as { assignedTo: { id: string } | null }).assignedTo;
  if (session.user.role !== Role.ADMIN && assignedTo?.id !== session.user.id) {
    return null;
  }
  return ticket;
}

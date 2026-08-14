import type { MessageAuthorType, MessageDirection } from "@/lib/generated/prisma/enums";

// The wire shape of a single TicketMessage as returned nested inside
// GET /api/tickets/[id]'s TicketDetail response (after NextResponse.json()
// serializes createdAt to an ISO string) — not the raw Prisma row. Mirrors
// models/ticket.model.ts's TicketListItem comment: a plain types module so
// hooks/use-ticket.ts and components/tickets/* don't reach into a Route
// Handler file. `author` is null for INBOUND/CUSTOMER messages and for
// AI/SYSTEM authored ones — only an AGENT-authored message has one.
export type TicketMessageItem = {
  id: string;
  direction: MessageDirection;
  authorType: MessageAuthorType;
  author: { id: string; name: string | null } | null;
  body: string;
  createdAt: string;
};

import type { MessageAuthorType, MessageDirection } from "@/lib/generated/prisma/enums";

// This is the wire shape of a single TicketMessage, nested inside GET /api/tickets/[id]'s TicketDetail response.
// NextResponse.json() turns createdAt into an ISO string. This is not the raw Prisma row.
//
// This mirrors models/ticket.model.ts's TicketListItem comment.
// It is a plain types module, so hooks/use-ticket.ts and components/tickets/* do not reach into a Route Handler file.
//
// `author` is null for INBOUND/CUSTOMER messages and for AI/SYSTEM authored ones.
// Only an AGENT-authored message has one.
export type TicketMessageItem = {
  id: string;
  direction: MessageDirection;
  authorType: MessageAuthorType;
  author: { id: string; name: string | null } | null;
  body: string;
  createdAt: string;
};

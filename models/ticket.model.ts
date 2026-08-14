import type { TicketStatus } from "@/lib/generated/prisma/enums";

// The wire shape of a ticket as returned by GET /api/tickets (after
// NextResponse.json() serializes createdAt to an ISO string) — not the raw
// Prisma row. Previously lived in app/api/tickets/route.ts itself; moved
// here so hooks/use-tickets.ts and components/tickets/* import a plain
// types module instead of reaching into a Route Handler file.
export type TicketListItem = {
  id: string;
  subject: string;
  status: TicketStatus;
  customerEmail: string;
  customerName: string | null;
  assignedTo: { id: string; name: string | null } | null;
  resolvedByAi: boolean;
  createdAt: string;
};

// No Zod schema yet — GET /api/tickets takes no query params this round
// (see that route's comment). A future ticketListQuerySchema (status/
// assignedTo filters, implementation-plan.md Phase 3's remaining item)
// belongs in this file, alongside createUserSchema's equivalent role in
// models/user.model.ts.

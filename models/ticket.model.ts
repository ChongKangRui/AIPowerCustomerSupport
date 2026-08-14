import { z } from "zod";

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

// Columns GET /api/tickets accepts as `sortBy` — deliberately just the
// fields that live directly on Ticket and are already shown as table
// columns. Customer (composite name+email) and Assigned (relation-derived)
// are out of scope for this round; see that route's comment for why.
export const TICKET_SORTABLE_FIELDS = ["subject", "status", "createdAt"] as const;
export type TicketSortableField = (typeof TICKET_SORTABLE_FIELDS)[number];

// Fixed, not client-configurable — "max row per page" is a product decision,
// not a per-request option, so there's no pageSize query param to sanitize.
export const TICKET_PAGE_SIZE = 20;

// "ALL" is a UI/query-param-only sentinel meaning "no status filter" — not a
// real TicketStatus, so it's a hardcoded literal tuple (same pattern as
// TICKET_SORTABLE_FIELDS above) rather than derived from the Prisma enum.
// Mirrors components/users/filter-users.ts's RoleFilter ("ALL" | Role).
export const TICKET_STATUS_FILTER_VALUES = ["ALL", "OPEN", "RESOLVED", "CLOSED"] as const;
export type TicketStatusFilter = (typeof TICKET_STATUS_FILTER_VALUES)[number];

// Query-param validation for GET /api/tickets, shared by the route handler
// and tickets-view.tsx (which parses the same URLSearchParams client-side to
// derive its initial state) so the two can't drift on defaults.
//
// These `.catch()` fallbacks are a deliberate choice, not laziness: page/
// sortBy/sortDir/status/q are view state a user can freely hand-edit into
// the URL (bookmark, share, typo), not a mutation payload — degrading a bad
// value to a sane default is the right behavior, unlike createUserSchema/
// updateUserSchema below-in-spirit (see models/user.model.ts), which
// correctly 400 on invalid input because those are mutations.
//
// sortBy's z.enum(TICKET_SORTABLE_FIELDS) is also the security boundary for
// this endpoint: it's what keeps a request-controlled string from ever
// becoming an arbitrary Prisma orderBy key. See app/api/tickets/route.ts's
// TICKET_ORDER_BY map for the second half of that defense (no dynamic
// bracket-key access into Prisma's query builder even post-validation).
// status's z.enum(TICKET_STATUS_FILTER_VALUES) is the equivalent boundary
// for the status filter's `where` clause.
export const ticketListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  sortBy: z.enum(TICKET_SORTABLE_FIELDS).catch("createdAt"),
  sortDir: z.enum(["asc", "desc"]).catch("desc"),
  status: z.enum(TICKET_STATUS_FILTER_VALUES).catch("ALL"),
  // Search-by-subject. No max-length cap: an absurdly long query just
  // matches nothing via `contains`, same cost as any other miss — not worth
  // an arbitrary truncation rule.
  q: z.string().trim().catch(""),
});

export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

export type TicketListResponse = {
  tickets: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
};

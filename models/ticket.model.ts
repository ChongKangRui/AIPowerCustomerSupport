import { z } from "zod";

import type { TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketSelect } from "@/lib/generated/prisma/models";
import type { TicketMessageItem } from "@/models/ticket-message.model";

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

// The wire shape of a single ticket as returned by GET /api/tickets/[id] —
// TicketListItem's fields plus the conversation thread and the
// currently-unpopulated Phase 4 AI fields (summary/category/sentiment),
// which are already columns on Ticket but not yet written by anything.
// resolvedAt/closedAt surface here (unlike the list view, which has no room
// to show them) since the detail page's Mark Resolved/Close actions need to
// read them back after a mutation.
export type TicketDetail = TicketListItem & {
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  summary: string | null;
  category: string | null;
  sentiment: string | null;
  messages: TicketMessageItem[];
};

// The Prisma `select` shape that produces TicketDetail above — a single
// source of truth shared by every route that reads/writes a full ticket
// (GET/PATCH app/api/tickets/[id]/route.ts, PATCH
// app/api/tickets/[id]/assign/route.ts), so none of them can quietly drift
// from what TicketDetail actually promises callers. Lives here rather than
// in one of those route files since it's consumed by more than one of them
// — a route file exporting something for a sibling route to import is the
// wrong direction of dependency; this models file is the neutral shared
// home, same as every other type/schema in it. `satisfies` (not a type
// annotation) keeps the object's literal shape intact for Prisma's own
// return-type inference at each call site, while still getting this
// declaration itself checked against Prisma's real TicketSelect shape.
export const ticketDetailSelect = {
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
} satisfies TicketSelect;

// Request-shape validation for PATCH /api/tickets/[id] — the only mutation
// this endpoint supports right now (status transitions triggered by the
// detail page's Mark Resolved/Close buttons). No `.catch()` fallback, unlike
// ticketListQuerySchema above: this is a mutation payload, not view state a
// user can freely hand-edit into a URL, so bad input should 400 (same
// reasoning as models/user.model.ts's createUserSchema/updateUserSchema).
// OPEN is deliberately not a valid target here — there's no UI action that
// reopens a ticket (see project-scope.md's lifecycle rules: reopening only
// happens automatically, on a customer reply to a Resolved ticket).
export const updateTicketStatusSchema = z.object({
  status: z.enum(["RESOLVED", "CLOSED"]),
});

export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

// Request-shape validation for PATCH /api/tickets/[id]/assign — single-
// ticket manual assignment (admin-only, OPEN tickets only; both enforced
// server-side in the route, not here). `assignedToId: null` means
// "unassign" — nullable rather than optional since the client always sends
// one or the other explicitly (no "leave unchanged" case for this field).
export const assignTicketSchema = z.object({
  assignedToId: z.string().min(1).nullable(),
});

export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

// Request-shape validation for PATCH /api/tickets/assign — the bulk
// counterpart, used by the tickets list's multi-select toolbar
// (components/tickets/tickets-view.tsx). Same assignedToId semantics as
// assignTicketSchema above, plus the set of ticket ids to apply it to.
export const bulkAssignTicketsSchema = z.object({
  ticketIds: z.array(z.string().min(1)).min(1),
  assignedToId: z.string().min(1).nullable(),
});

export type BulkAssignTicketsInput = z.infer<typeof bulkAssignTicketsSchema>;

// Request-shape validation for POST /api/tickets/[id]/reply — an agent's
// outbound reply, sent as real email via lib/gmail.ts's sendGmailReply() and
// stored as an OUTBOUND/AGENT TicketMessage. Mutation payload, so (like
// updateTicketStatusSchema above) bad input 400s rather than falling back.
export const sendTicketReplySchema = z.object({
  body: z.string().trim().min(1),
});

export type SendTicketReplyInput = z.infer<typeof sendTicketReplySchema>;

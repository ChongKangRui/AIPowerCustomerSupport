import { z } from "zod";

import type { TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketSelect } from "@/lib/generated/prisma/models";
import type { TicketMessageItem } from "@/models/ticket-message.model";

// This is the wire shape of a ticket from GET /api/tickets.
// NextResponse.json() turns createdAt into an ISO string. This is not the raw Prisma row.
//
// This type used to live in app/api/tickets/route.ts.
// It moved here so hooks/use-tickets.ts and components/tickets/* can import a plain types module.
// They do not need to import a Route Handler file.
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

// These are the columns GET /api/tickets accepts as `sortBy`.
// Each field lives directly on Ticket and already shows as a table column.
// Customer (a name+email pair) and Assigned (from a relation) are out of scope for now.
// See that route's comment for the reason.
export const TICKET_SORTABLE_FIELDS = ["subject", "status", "createdAt"] as const;
export type TicketSortableField = (typeof TICKET_SORTABLE_FIELDS)[number];

// This value is fixed. The client cannot change it.
// "Max rows per page" is a product decision, not a per-request option.
// So there is no pageSize query param to check.
export const TICKET_PAGE_SIZE = 20;

// "ALL" means "no status filter". It only exists in the UI and query params.
// It is not a real TicketStatus.
// So this is a fixed literal tuple, like TICKET_SORTABLE_FIELDS above, not a value derived from the Prisma enum.
// This mirrors components/users/filter-users.ts's RoleFilter ("ALL" | Role).
export const TICKET_STATUS_FILTER_VALUES = ["ALL", "OPEN", "RESOLVED", "CLOSED"] as const;
export type TicketStatusFilter = (typeof TICKET_STATUS_FILTER_VALUES)[number];

// This schema checks the query params for GET /api/tickets.
// The route handler and tickets-view.tsx both use it.
// tickets-view.tsx parses the same URLSearchParams on the client to set its initial state.
// One shared schema keeps the defaults from drifting apart.
//
// The `.catch()` fallbacks are a deliberate choice, not a shortcut.
// page, sortBy, sortDir, status, and q are view state.
// A user can freely edit these values into the URL: bookmark it, share it, or type it wrong.
// This is not a mutation payload, so a bad value should fall back to a safe default, not error.
// Compare this to createUserSchema and updateUserSchema in models/user.model.ts.
// Those schemas return a 400 error on bad input because they handle mutations.
export const ticketListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  // This is also the security boundary for this endpoint.
  // This z.enum stops a request-controlled string from becoming an arbitrary Prisma orderBy key.
  // See app/api/tickets/route.ts's TICKET_ORDER_BY map for the second half of that defense.
  // That map avoids dynamic bracket-key access into Prisma's query builder, even after validation.
  sortBy: z.enum(TICKET_SORTABLE_FIELDS).catch("createdAt"),
  sortDir: z.enum(["asc", "desc"]).catch("desc"),
  // This plays the same security-boundary role as sortBy above, for the status filter's `where` clause.
  status: z.enum(TICKET_STATUS_FILTER_VALUES).catch("ALL"),
  // This searches by subject. It has no max-length cap.
  // An absurdly long query just matches nothing through `contains`.
  // That costs the same as any other miss, so a truncation rule is not worth adding.
  q: z.string().trim().catch(""),
});

export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

export type TicketListResponse = {
  tickets: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
};

// This is the wire shape of a single ticket from GET /api/tickets/[id].
// It has all of TicketListItem's fields, plus the conversation thread.
// It also has the Phase 4 AI fields: summary, category, and sentiment.
// These columns already exist on Ticket, but nothing writes to them yet.
//
// resolvedAt and closedAt appear here but not in the list view.
// The list view has no room to show them.
// The detail page's Mark Resolved and Close actions need to read these values back after a mutation.
export type TicketDetail = TicketListItem & {
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  summary: string | null;
  category: string | null;
  sentiment: string | null;
  messages: TicketMessageItem[];
};

// This Prisma `select` shape produces the TicketDetail type above.
// Every route that reads or writes a full ticket shares it: GET/PATCH app/api/tickets/[id]/route.ts, and PATCH app/api/tickets/[id]/assign/route.ts.
// One shared shape stops any of them from quietly drifting away from what TicketDetail promises callers.
//
// This lives here, not in one of those route files, because more than one route uses it.
// A route file that exports something for a sibling route to import points the wrong way.
// This models file is the neutral shared home, like every other type and schema in it.
//
// `satisfies` checks this declaration against Prisma's real TicketSelect shape.
// A type annotation would not do that. It would also widen the object and lose Prisma's own return-type inference at each call site.
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

// This checks the request body for PATCH /api/tickets/[id].
// Right now this endpoint supports only one mutation: a status transition.
// The detail page's Mark Resolved and Close buttons trigger it.
//
// Unlike ticketListQuerySchema above, this has no `.catch()` fallback.
// This is a mutation payload, not view state a user can edit into a URL.
// So bad input should return a 400 error, like createUserSchema and updateUserSchema in models/user.model.ts.
//
// OPEN is not a valid target here. No UI action reopens a ticket.
// See project-scope.md's lifecycle rules: reopening only happens automatically, when a customer replies to a Resolved ticket.
export const updateTicketStatusSchema = z.object({
  status: z.enum(["RESOLVED", "CLOSED"]),
});

export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

// This checks the request body for PATCH /api/tickets/[id]/assign.
// This assigns one ticket by hand. Only an admin can do this, and only for OPEN tickets.
// The route enforces both rules on the server, not this schema.
// `assignedToId: null` means "unassign".
// The field is nullable, not optional, because the client always sends one value or the other. There is no "leave unchanged" case.
export const assignTicketSchema = z.object({
  assignedToId: z.string().min(1).nullable(),
});

export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

// This checks the request body for PATCH /api/tickets/assign, the bulk version of assignTicketSchema above.
// The tickets list's multi-select toolbar uses it (components/tickets/tickets-view.tsx).
// assignedToId works the same way as in assignTicketSchema.
// It also carries the set of ticket ids to apply the assignment to.
export const bulkAssignTicketsSchema = z.object({
  ticketIds: z.array(z.string().min(1)).min(1),
  assignedToId: z.string().min(1).nullable(),
});

export type BulkAssignTicketsInput = z.infer<typeof bulkAssignTicketsSchema>;

// This checks the request body for POST /api/tickets/[id]/reply.
// This is an agent's outbound reply.
// lib/gmail.ts's sendGmailReply() sends it as a real email, and the app stores it as an OUTBOUND/AGENT TicketMessage.
// This is a mutation payload, so bad input returns a 400 error instead of falling back, like updateTicketStatusSchema above.
export const sendTicketReplySchema = z.object({
  body: z.string().trim().min(1),
});

export type SendTicketReplyInput = z.infer<typeof sendTicketReplySchema>;

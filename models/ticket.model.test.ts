import { describe, expect, it } from "vitest";

import {
  assignTicketSchema,
  bulkAssignTicketsSchema,
  ticketListQuerySchema,
  updateTicketStatusSchema,
} from "@/models/ticket.model";

// ticketListQuerySchema is the shared source of truth for GET
// /api/tickets' query-param validation and for tickets-view.tsx's
// client-side parse of the same URLSearchParams. See that schema's own
// comment.
//
// This tests its .catch() fallbacks, not a thrown ZodError. page,
// sortBy, and sortDir are view state a user can freely hand-edit into
// the URL. A bad value should silently degrade to a default, not error.
describe("ticketListQuerySchema", () => {
  it("defaults page/sortBy/sortDir/status/q when all params are omitted", () => {
    const result = ticketListQuerySchema.parse({});

    expect(result).toEqual({
      page: 1,
      sortBy: "createdAt",
      sortDir: "desc",
      status: "ALL",
      q: "",
    });
  });

  it("coerces a numeric-string page (as URLSearchParams always produces) to a number", () => {
    const result = ticketListQuerySchema.parse({ page: "3" });

    expect(result.page).toBe(3);
  });

  it.each([
    ["0", 1],
    ["-1", 1],
    ["abc", 1],
  ])("falls back page=%s to 1", (input, expected) => {
    const result = ticketListQuerySchema.parse({ page: input });

    expect(result.page).toBe(expected);
  });

  it("falls back an unrecognized sortBy to \"createdAt\"", () => {
    const result = ticketListQuerySchema.parse({ sortBy: "id; DROP TABLE \"Ticket\";" });

    expect(result.sortBy).toBe("createdAt");
  });

  it("falls back an unrecognized sortDir to \"desc\"", () => {
    const result = ticketListQuerySchema.parse({ sortDir: "sideways" });

    expect(result.sortDir).toBe("desc");
  });

  it.each(["subject", "status", "createdAt"] as const)(
    "accepts %s as a valid sortBy",
    (sortBy) => {
      const result = ticketListQuerySchema.parse({ sortBy });

      expect(result.sortBy).toBe(sortBy);
    }
  );

  it.each(["asc", "desc"] as const)("accepts %s as a valid sortDir", (sortDir) => {
    const result = ticketListQuerySchema.parse({ sortDir });

    expect(result.sortDir).toBe(sortDir);
  });

  it.each(["ALL", "OPEN", "RESOLVED", "CLOSED"] as const)(
    "accepts %s as a valid status filter",
    (status) => {
      const result = ticketListQuerySchema.parse({ status });

      expect(result.status).toBe(status);
    }
  );

  it("falls back an unrecognized status to \"ALL\" (no filter) rather than erroring", () => {
    const result = ticketListQuerySchema.parse({ status: "ARCHIVED" });

    expect(result.status).toBe("ALL");
  });

  it("trims whitespace around q", () => {
    const result = ticketListQuerySchema.parse({ q: "  refund  " });

    expect(result.q).toBe("refund");
  });

  it("defaults q to an empty string (no search) when omitted", () => {
    const result = ticketListQuerySchema.parse({});

    expect(result.q).toBe("");
  });
});

// updateTicketStatusSchema is PATCH /api/tickets/[id]'s body validator,
// a mutation payload, not view state. So unlike ticketListQuerySchema
// above, it has no .catch() fallback. Bad input must throw, which
// triggers the route's automatic ZodError-to-400 handling in
// lib/api-handler.ts, instead of silently degrading.
//
// The actual OPEN/RESOLVED/CLOSED transition legality — for example,
// that a CLOSED ticket cannot move anywhere — is a separate,
// DB-dependent concern (app/api/tickets/[id]/route.ts's
// ALLOWED_TRANSITIONS). e2e covers that, not this file. This file
// covers only "is this a well-shaped request body at all."
describe("updateTicketStatusSchema", () => {
  it.each(["RESOLVED", "CLOSED"] as const)("accepts %s as a valid status", (status) => {
    const result = updateTicketStatusSchema.parse({ status });

    expect(result.status).toBe(status);
  });

  it("rejects OPEN — there's no UI action that reopens a ticket", () => {
    expect(() => updateTicketStatusSchema.parse({ status: "OPEN" })).toThrow();
  });

  it("rejects an unrecognized status string", () => {
    expect(() => updateTicketStatusSchema.parse({ status: "ARCHIVED" })).toThrow();
  });

  it("rejects a missing status", () => {
    expect(() => updateTicketStatusSchema.parse({})).toThrow();
  });
});

// assignTicketSchema and bulkAssignTicketsSchema are PATCH
// /api/tickets/[id]/assign and PATCH /api/tickets/assign's body
// validators. They are mutation payloads, so the same reasoning as
// updateTicketStatusSchema above applies: bad input must throw, not
// silently degrade.
//
// Admin-only and OPEN-only eligibility is DB-dependent, and e2e covers
// that, not this file. This file covers only "is this a well-shaped
// request body at all."
describe("assignTicketSchema", () => {
  it("accepts a non-empty assignedToId", () => {
    const result = assignTicketSchema.parse({ assignedToId: "user-1" });

    expect(result.assignedToId).toBe("user-1");
  });

  it("accepts null — unassigning", () => {
    const result = assignTicketSchema.parse({ assignedToId: null });

    expect(result.assignedToId).toBeNull();
  });

  it("rejects an empty-string assignedToId", () => {
    expect(() => assignTicketSchema.parse({ assignedToId: "" })).toThrow();
  });

  it("rejects a missing assignedToId — null must be sent explicitly to unassign", () => {
    expect(() => assignTicketSchema.parse({})).toThrow();
  });
});

describe("bulkAssignTicketsSchema", () => {
  it("accepts a non-empty ticketIds array with a non-empty assignedToId", () => {
    const result = bulkAssignTicketsSchema.parse({
      ticketIds: ["ticket-1", "ticket-2"],
      assignedToId: "user-1",
    });

    expect(result).toEqual({ ticketIds: ["ticket-1", "ticket-2"], assignedToId: "user-1" });
  });

  it("accepts null assignedToId — bulk unassigning", () => {
    const result = bulkAssignTicketsSchema.parse({ ticketIds: ["ticket-1"], assignedToId: null });

    expect(result.assignedToId).toBeNull();
  });

  it("rejects an empty ticketIds array", () => {
    expect(() =>
      bulkAssignTicketsSchema.parse({ ticketIds: [], assignedToId: "user-1" })
    ).toThrow();
  });

  it("rejects a missing assignedToId", () => {
    expect(() => bulkAssignTicketsSchema.parse({ ticketIds: ["ticket-1"] })).toThrow();
  });
});

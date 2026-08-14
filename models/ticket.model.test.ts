import { describe, expect, it } from "vitest";

import { ticketListQuerySchema, updateTicketStatusSchema } from "@/models/ticket.model";

// ticketListQuerySchema is the shared source of truth for GET /api/tickets'
// query-param validation and tickets-view.tsx's client-side parse of the
// same URLSearchParams — see that schema's own comment. Its .catch()
// fallbacks (rather than a thrown ZodError) are the behavior under test
// here: page/sortBy/sortDir are view state a user can freely hand-edit into
// the URL, so a bad value should silently degrade to a default, not error.
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

// updateTicketStatusSchema is PATCH /api/tickets/[id]'s body validator — a
// mutation payload, not view state, so unlike ticketListQuerySchema above it
// has no .catch() fallback: bad input must throw (→ the route's automatic
// ZodError-to-400 handling in lib/api-handler.ts), not silently degrade. The
// actual OPEN/RESOLVED/CLOSED transition *legality* (e.g. can't move a
// CLOSED ticket anywhere) is a separate, DB-dependent concern
// (app/api/tickets/[id]/route.ts's ALLOWED_TRANSITIONS) covered by e2e, not
// here — this only covers "is this a well-shaped request body at all".
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

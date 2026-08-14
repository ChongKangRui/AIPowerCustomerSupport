import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TicketStatus } from "@/lib/generated/prisma/enums";
import { TicketsTable } from "@/components/tickets/tickets-table";
import type { TicketListItem } from "@/models/ticket.model";

// TicketsTable is pure/presentational — driven entirely by the `tickets`
// prop, no hooks or network calls — so it's cheap to cover directly with
// React Testing Library instead of through a full e2e round trip (real
// login + DB fixtures + Playwright browser). This is the component-test half
// of what used to be exercised only via e2e/tickets.spec.ts's "renders the
// literal text 'Unassigned'" test; the rest of that file (server-side
// role-scoping, sort order returned by the API, access control) still needs
// a real backend and stays there — see that file's own comment.
afterEach(cleanup);

function ticket(overrides: Partial<TicketListItem>): TicketListItem {
  return {
    id: "ticket-1",
    subject: "Can't log in",
    status: TicketStatus.OPEN,
    customerEmail: "customer@example.com",
    customerName: null,
    assignedTo: null,
    resolvedByAi: false,
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("TicketsTable", () => {
  it("renders the literal text 'Unassigned' for a ticket with no assignedTo", () => {
    render(<TicketsTable tickets={[ticket({ assignedTo: null })]} />);

    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("renders the assignee's name instead, when one is set", () => {
    render(
      <TicketsTable
        tickets={[ticket({ assignedTo: { id: "agent-1", name: "Grace Hopper" } })]}
      />
    );

    expect(screen.getByText("Grace Hopper")).toBeTruthy();
    expect(screen.queryByText("Unassigned")).toBeNull();
  });

  it("renders the customer's email alone when no customerName is set", () => {
    render(
      <TicketsTable
        tickets={[ticket({ customerName: null, customerEmail: "anon@example.com" })]}
      />
    );

    expect(screen.getByText("anon@example.com")).toBeTruthy();
  });

  it("renders the customer's name (with the email as a sub-line) when customerName is set", () => {
    render(
      <TicketsTable
        tickets={[
          ticket({ customerName: "Ada Lovelace", customerEmail: "ada@example.com" }),
        ]}
      />
    );

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketDetail } from "@/models/ticket.model";

afterEach(cleanup);

function ticket(overrides: Partial<TicketDetail>): TicketDetail {
  return {
    id: "ticket-1",
    subject: "Can't log in",
    status: TicketStatus.OPEN,
    customerEmail: "customer@example.com",
    customerName: null,
    assignedTo: null,
    resolvedByAi: false,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    resolvedAt: null,
    closedAt: null,
    summary: null,
    category: null,
    sentiment: null,
    messages: [],
    ...overrides,
  };
}

// TicketDetailHeader is pure/presentational — driven entirely by the
// `ticket` prop, no data fetching — so its fallback text (customer email
// alone vs. "name · email", "Unassigned") is cheap to cover directly rather
// than through TicketDetailView + a mocked network round trip. Mirrors
// tickets-table.test.tsx's coverage of the same fallback rules on the list
// page's Customer/Assigned columns.
describe("TicketDetailHeader", () => {
  it("renders the subject as a heading and links back to /tickets", () => {
    render(<TicketDetailHeader ticket={ticket({ subject: "Refund request" })} />);

    expect(screen.getByRole("heading", { name: "Refund request" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /back to tickets/i }).getAttribute("href")
    ).toBe("/tickets");
  });

  it("renders the ticket's status via StatusBadge", () => {
    render(<TicketDetailHeader ticket={ticket({ status: TicketStatus.RESOLVED })} />);

    expect(screen.getByText(TicketStatus.RESOLVED)).toBeTruthy();
  });

  it("renders the customer's email alone when no customerName is set", () => {
    render(
      <TicketDetailHeader
        ticket={ticket({ customerName: null, customerEmail: "anon@example.com" })}
      />
    );

    expect(screen.getByText("anon@example.com")).toBeTruthy();
  });

  it("renders the customer's name and email together when customerName is set", () => {
    render(
      <TicketDetailHeader
        ticket={ticket({ customerName: "Ada Lovelace", customerEmail: "ada@example.com" })}
      />
    );

    expect(screen.getByText("Ada Lovelace · ada@example.com")).toBeTruthy();
  });

  it("renders \"Unassigned\" when assignedTo is null", () => {
    render(<TicketDetailHeader ticket={ticket({ assignedTo: null })} />);

    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("renders the assignee's name instead, when one is set", () => {
    render(
      <TicketDetailHeader
        ticket={ticket({ assignedTo: { id: "agent-1", name: "Grace Hopper" } })}
      />
    );

    expect(screen.getByText("Grace Hopper")).toBeTruthy();
    expect(screen.queryByText("Unassigned")).toBeNull();
  });
});

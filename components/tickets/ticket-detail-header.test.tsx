import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketDetail } from "@/models/ticket.model";

afterEach(cleanup);

// isAdmin/agents/onAssign/assignPending are covered by their own
// admin-gating behavior elsewhere (this file is about the plain
// customer/assignee fallback text); every render below stays in the
// read-only "not an admin" branch unless a test explicitly overrides it.
const noAssignProps = { isAdmin: false, agents: [], onAssign: vi.fn(), assignPending: false };

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
    render(<TicketDetailHeader ticket={ticket({ subject: "Refund request" })} {...noAssignProps} />);

    expect(screen.getByRole("heading", { name: "Refund request" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /back to tickets/i }).getAttribute("href")
    ).toBe("/tickets");
  });

  it("renders the ticket's status via StatusBadge", () => {
    render(<TicketDetailHeader ticket={ticket({ status: TicketStatus.RESOLVED })} {...noAssignProps} />);

    expect(screen.getByText(TicketStatus.RESOLVED)).toBeTruthy();
  });

  it("renders the customer's email alone when no customerName is set", () => {
    render(
      <TicketDetailHeader
        ticket={ticket({ customerName: null, customerEmail: "anon@example.com" })}
        {...noAssignProps}
      />
    );

    expect(screen.getByText("anon@example.com")).toBeTruthy();
  });

  it("renders the customer's name and email together when customerName is set", () => {
    render(
      <TicketDetailHeader
        ticket={ticket({ customerName: "Ada Lovelace", customerEmail: "ada@example.com" })}
        {...noAssignProps}
      />
    );

    expect(screen.getByText("Ada Lovelace · ada@example.com")).toBeTruthy();
  });

  it("renders \"Unassigned\" when assignedTo is null", () => {
    render(<TicketDetailHeader ticket={ticket({ assignedTo: null })} {...noAssignProps} />);

    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("renders the assignee's name instead, when one is set", () => {
    render(
      <TicketDetailHeader
        ticket={ticket({ assignedTo: { id: "agent-1", name: "Grace Hopper" } })}
        {...noAssignProps}
      />
    );

    expect(screen.getByText("Grace Hopper")).toBeTruthy();
    expect(screen.queryByText("Unassigned")).toBeNull();
  });

  // canAssign = isAdmin && ticket.status === OPEN (ticket-detail-header.tsx) —
  // the actual enforcement is server-side (app/api/tickets/[id]/assign/
  // route.ts), but this is the one place deciding whether the control even
  // renders, so each half of that condition gets its own case rather than
  // trusting the && to keep working.
  describe("assign control", () => {
    const agents = [
      { id: "agent-1", name: "Grace Hopper", email: "grace@example.com", role: "AGENT" as const, createdAt: "" },
    ];

    it("renders an interactive assign control for an admin viewing an OPEN ticket", () => {
      render(
        <TicketDetailHeader
          ticket={ticket({ status: TicketStatus.OPEN, assignedTo: null })}
          isAdmin
          agents={agents}
          onAssign={vi.fn()}
          assignPending={false}
        />
      );

      expect(screen.getByRole("button", { name: /Unassigned/ })).toBeTruthy();
    });

    it("renders plain read-only text (no button) for a non-admin, even on an OPEN ticket", () => {
      render(
        <TicketDetailHeader ticket={ticket({ status: TicketStatus.OPEN })} {...noAssignProps} />
      );

      expect(screen.queryByRole("button", { name: /Unassigned/ })).toBeNull();
      expect(screen.getByText("Unassigned")).toBeTruthy();
    });

    it("renders plain read-only text (no button) for an admin viewing a non-OPEN ticket", () => {
      render(
        <TicketDetailHeader
          ticket={ticket({ status: TicketStatus.RESOLVED, assignedTo: null })}
          isAdmin
          agents={agents}
          onAssign={vi.fn()}
          assignPending={false}
        />
      );

      expect(screen.queryByRole("button", { name: /Unassigned/ })).toBeNull();
      expect(screen.getByText("Unassigned")).toBeTruthy();
    });

    it("picking an agent from the dropdown calls onAssign with that agent's id", async () => {
      const onAssign = vi.fn();
      render(
        <TicketDetailHeader
          ticket={ticket({ status: TicketStatus.OPEN, assignedTo: null })}
          isAdmin
          agents={agents}
          onAssign={onAssign}
          assignPending={false}
        />
      );

      // Radix's DropdownMenuTrigger opens on pointerdown, not click (see
      // node_modules/@radix-ui/react-dropdown-menu) — a plain fireEvent.click
      // never fires that handler in jsdom.
      fireEvent.pointerDown(screen.getByRole("button", { name: /Unassigned/ }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitemradio", { name: "Grace Hopper" }));

      expect(onAssign).toHaveBeenCalledWith("agent-1");
    });

    it("renders the assign error message when assignError is set", () => {
      render(
        <TicketDetailHeader
          ticket={ticket({ status: TicketStatus.OPEN })}
          isAdmin
          agents={agents}
          onAssign={vi.fn()}
          assignPending={false}
          assignError="Only open tickets can be assigned"
        />
      );

      expect(screen.getByRole("alert").textContent).toBe("Only open tickets can be assigned");
    });
  });
});

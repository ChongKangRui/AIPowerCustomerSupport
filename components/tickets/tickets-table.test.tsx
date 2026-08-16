import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RowSelectionState } from "@tanstack/react-table";

import { TicketStatus } from "@/lib/generated/prisma/enums";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { useTicketsTable } from "@/components/tickets/use-tickets-table";
import type { TicketListItem, TicketSortableField } from "@/models/ticket.model";
import type { UserListItem } from "@/models/user.model";

// TicketsTable is pure and presentational. The `table` instance prop
// (built by useTicketsTable(), see that hook's own comment) drives it
// entirely, with no data fetching or URL access of its own. That makes
// it cheap to cover directly with React Testing Library, instead of
// through a full e2e round trip of real login, DB fixtures, and a
// Playwright browser.
//
// This is the component-test half of what used to run only through
// e2e/tickets.spec.ts's "renders the literal text 'Unassigned'" test.
// The rest of that file — server-side role-scoping, sort order and
// pagination returned by the API, access control — still needs a real
// backend and stays there. See that file's own comment.
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

// Renders TicketsTable behind a real useTicketsTable() instance. The
// hook is a thin translation layer, already well tested elsewhere
// (use-tickets-table.test.ts). Driving TicketsTable through it here,
// instead of stubbing a fake `table` object, exercises the actual
// header and cell wiring the app renders. The cost is a wrapper
// component, since hooks run only inside one.
function renderTicketsTable({
  tickets,
  sortBy = "createdAt",
  sortDir = "desc",
  onSortChange = vi.fn(),
  canAssign = false,
  agents = [],
  rowSelection = {},
  onRowSelectionChange = vi.fn(),
  onAssignOne = vi.fn(),
  assigningId = null,
}: {
  tickets: TicketListItem[];
  sortBy?: TicketSortableField;
  sortDir?: "asc" | "desc";
  onSortChange?: (field: TicketSortableField, dir: "asc" | "desc") => void;
  canAssign?: boolean;
  agents?: UserListItem[];
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void;
  onAssignOne?: (ticketId: string, assignedToId: string | null) => void;
  assigningId?: string | null;
}) {
  function Wrapper() {
    const table = useTicketsTable({
      tickets,
      total: tickets.length,
      page: 1,
      sortBy,
      sortDir,
      onSortChange,
      onPageChange: vi.fn(),
      canAssign,
      agents,
      rowSelection,
      onRowSelectionChange,
      onAssignOne,
      assigningId,
    });
    return <TicketsTable table={table} />;
  }

  render(<Wrapper />);
}

describe("TicketsTable", () => {
  it("renders the subject as a link to that ticket's detail page", () => {
    renderTicketsTable({ tickets: [ticket({ id: "ticket-42", subject: "Refund request" })] });

    expect(screen.getByRole("link", { name: "Refund request" }).getAttribute("href")).toBe(
      "/tickets/ticket-42"
    );
  });

  it("renders the literal text 'Unassigned' for a ticket with no assignedTo", () => {
    renderTicketsTable({ tickets: [ticket({ assignedTo: null })] });

    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("renders the assignee's name instead, when one is set", () => {
    renderTicketsTable({
      tickets: [ticket({ assignedTo: { id: "agent-1", name: "Grace Hopper" } })],
    });

    expect(screen.getByText("Grace Hopper")).toBeTruthy();
    expect(screen.queryByText("Unassigned")).toBeNull();
  });

  it("renders the customer's email alone when no customerName is set", () => {
    renderTicketsTable({
      tickets: [ticket({ customerName: null, customerEmail: "anon@example.com" })],
    });

    expect(screen.getByText("anon@example.com")).toBeTruthy();
  });

  it("renders the customer's name (with the email as a sub-line) when customerName is set", () => {
    renderTicketsTable({
      tickets: [ticket({ customerName: "Ada Lovelace", customerEmail: "ada@example.com" })],
    });

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
  });

  describe("sortable headers", () => {
    it("clicking a column that isn't the active sort calls onSortChange with that field, ascending", () => {
      const onSortChange = vi.fn();
      renderTicketsTable({ tickets: [ticket({})], sortBy: "createdAt", sortDir: "desc", onSortChange });

      screen.getByRole("button", { name: "Subject" }).click();

      expect(onSortChange).toHaveBeenCalledWith("subject", "asc");
    });

    it("clicking the already-active column flips its direction", () => {
      const onSortChange = vi.fn();
      renderTicketsTable({ tickets: [ticket({})], sortBy: "status", sortDir: "asc", onSortChange });

      screen.getByRole("button", { name: /Status/ }).click();

      expect(onSortChange).toHaveBeenCalledWith("status", "desc");
    });

    it("marks the active sortable column's header with aria-sort", () => {
      renderTicketsTable({ tickets: [ticket({})], sortBy: "createdAt", sortDir: "desc" });

      expect(
        screen.getByRole("columnheader", { name: /Created/ }).getAttribute("aria-sort")
      ).toBe("descending");
      expect(
        screen.getByRole("columnheader", { name: "Subject" }).getAttribute("aria-sort")
      ).toBe("none");
    });

    it("Customer and Assigned headers render without a sort button or aria-sort", () => {
      renderTicketsTable({ tickets: [ticket({})] });

      expect(screen.queryByRole("button", { name: "Customer" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Assigned" })).toBeNull();
      expect(
        screen.getByRole("columnheader", { name: "Customer" }).getAttribute("aria-sort")
      ).toBeNull();
    });
  });

  // canAssign (threaded through from tickets-view.tsx's isAdmin check)
  // gates both the leading select column and the Assigned column's
  // interactivity.
  //
  // The highest-stakes bug this whole feature could have is letting a
  // non-OPEN ticket get selected or reassigned from the list. Most of
  // these cases target that risk. See use-tickets-table.test.ts's
  // enableRowSelection tests for the same guarantee at the predicate
  // level, independent of rendering.
  describe("assignment (canAssign: true)", () => {
    const agents: UserListItem[] = [
      { id: "agent-1", name: "Grace Hopper", email: "grace@example.com", role: "AGENT" as const, createdAt: "" },
    ];

    it("renders no select column or interactive assign control at all when canAssign is false", () => {
      renderTicketsTable({ tickets: [ticket({ status: TicketStatus.OPEN })], canAssign: false });

      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.queryByRole("button", { name: /Unassigned/ })).toBeNull();
    });

    it("renders an enabled checkbox for an OPEN ticket, and a disabled one for a RESOLVED ticket", () => {
      renderTicketsTable({
        tickets: [
          ticket({ id: "open-1", subject: "Open ticket", status: TicketStatus.OPEN }),
          ticket({ id: "resolved-1", subject: "Resolved ticket", status: TicketStatus.RESOLVED }),
        ],
        canAssign: true,
      });

      expect(
        (screen.getByRole("checkbox", { name: "Select Open ticket" }) as HTMLButtonElement).disabled
      ).toBe(false);
      expect(
        (screen.getByRole("checkbox", { name: "Select Resolved ticket" }) as HTMLButtonElement).disabled
      ).toBe(true);
    });

    it("clicking a row's checkbox reports that ticket as newly selected via onRowSelectionChange", () => {
      const onRowSelectionChange = vi.fn();
      renderTicketsTable({
        tickets: [ticket({ id: "ticket-42", subject: "Refund request", status: TicketStatus.OPEN })],
        canAssign: true,
        onRowSelectionChange,
      });

      fireEvent.click(screen.getByRole("checkbox", { name: "Select Refund request" }));

      expect(onRowSelectionChange).toHaveBeenCalled();
      const updater = onRowSelectionChange.mock.calls[0][0];
      const next = typeof updater === "function" ? updater({}) : updater;
      expect(next).toEqual({ "ticket-42": true });
    });

    it("renders an interactive assign button (not plain text) in the Assigned column for an OPEN ticket", () => {
      renderTicketsTable({
        tickets: [ticket({ status: TicketStatus.OPEN, assignedTo: null })],
        canAssign: true,
        agents,
      });

      expect(screen.getByRole("button", { name: /Unassigned/ })).toBeTruthy();
    });

    it("renders plain read-only text (no button) in the Assigned column for a non-OPEN ticket, even when canAssign", () => {
      renderTicketsTable({
        tickets: [ticket({ status: TicketStatus.RESOLVED, assignedTo: null })],
        canAssign: true,
        agents,
      });

      expect(screen.queryByRole("button", { name: /Unassigned/ })).toBeNull();
      expect(screen.getByText("Unassigned")).toBeTruthy();
    });

    it("picking an agent from a row's assign menu calls onAssignOne with that ticket's id and the agent's id", async () => {
      const onAssignOne = vi.fn();
      renderTicketsTable({
        tickets: [ticket({ id: "ticket-42", status: TicketStatus.OPEN, assignedTo: null })],
        canAssign: true,
        agents,
        onAssignOne,
      });

      // Radix's DropdownMenuTrigger opens on pointerdown, not click.
      // See ticket-detail-header.test.tsx's "assign control" describe block.
      fireEvent.pointerDown(screen.getByRole("button", { name: /Unassigned/ }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitemradio", { name: "Grace Hopper" }));

      expect(onAssignOne).toHaveBeenCalledWith("ticket-42", "agent-1");
    });
  });
});

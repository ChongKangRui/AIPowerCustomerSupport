import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TicketStatus } from "@/lib/generated/prisma/enums";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { useTicketsTable } from "@/components/tickets/use-tickets-table";
import type { TicketListItem, TicketSortableField } from "@/models/ticket.model";

// TicketsTable is pure/presentational — driven entirely by the `table`
// instance prop (built by useTicketsTable(), see that hook's own comment),
// no data fetching or URL access itself — so it's cheap to cover directly
// with React Testing Library instead of through a full e2e round trip (real
// login + DB fixtures + Playwright browser). This is the component-test
// half of what used to be exercised only via e2e/tickets.spec.ts's
// "renders the literal text 'Unassigned'" test; the rest of that file
// (server-side role-scoping, sort order/pagination returned by the API,
// access control) still needs a real backend and stays there — see that
// file's own comment.
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

// Renders TicketsTable behind a real useTicketsTable() instance — the hook
// is a thin, well-tested-elsewhere (use-tickets-table.test.ts) translation
// layer, so driving TicketsTable through it here (rather than stubbing a
// fake `table` object) exercises the actual header/cell wiring the app
// renders, at the cost of needing a wrapper component since hooks only run
// inside one.
function renderTicketsTable({
  tickets,
  sortBy = "createdAt",
  sortDir = "desc",
  onSortChange = vi.fn(),
}: {
  tickets: TicketListItem[];
  sortBy?: TicketSortableField;
  sortDir?: "asc" | "desc";
  onSortChange?: (field: TicketSortableField, dir: "asc" | "desc") => void;
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
});

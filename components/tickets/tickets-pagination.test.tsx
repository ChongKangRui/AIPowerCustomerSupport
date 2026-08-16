import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TicketsPagination } from "@/components/tickets/tickets-pagination";
import { useTicketsTable } from "@/components/tickets/use-tickets-table";

// TicketsPagination is pure and presentational, driven by the same
// shared `table` instance TicketsTable renders. See that file's test
// for why this uses a real useTicketsTable() instance instead of a
// stubbed fake.
//
// This repo has no jest-dom (see other *.test.tsx files). So the tests
// check disabled state through the button's own `.disabled` property,
// not a `toBeDisabled()` matcher.
afterEach(cleanup);

function renderPagination({ page, total, onPageChange = vi.fn() }: {
  page: number;
  total: number;
  onPageChange?: (page: number) => void;
}) {
  function Wrapper() {
    const table = useTicketsTable({
      tickets: [],
      total,
      page,
      sortBy: "createdAt",
      sortDir: "desc",
      onSortChange: vi.fn(),
      onPageChange,
      canAssign: false,
      agents: [],
      rowSelection: {},
      onRowSelectionChange: vi.fn(),
      onAssignOne: vi.fn(),
      assigningId: null,
    });
    return <TicketsPagination table={table} total={total} />;
  }

  render(<Wrapper />);
}

function button(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("TicketsPagination", () => {
  it("disables Previous (not Next) on the first page of a multi-page result", () => {
    renderPagination({ page: 1, total: 45 }); // 3 pages at 20/page

    expect(button("Previous").disabled).toBe(true);
    expect(button("Next").disabled).toBe(false);
  });

  it("disables Next (not Previous) on the last page", () => {
    renderPagination({ page: 3, total: 45 });

    expect(button("Previous").disabled).toBe(false);
    expect(button("Next").disabled).toBe(true);
  });

  it("enables both Previous and Next on a middle page", () => {
    renderPagination({ page: 2, total: 45 });

    expect(button("Previous").disabled).toBe(false);
    expect(button("Next").disabled).toBe(false);
  });

  it("clicking Next calls onPageChange with page + 1", () => {
    const onPageChange = vi.fn();
    renderPagination({ page: 1, total: 45, onPageChange });

    button("Next").click();

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("clicking Previous calls onPageChange with page - 1", () => {
    const onPageChange = vi.fn();
    renderPagination({ page: 2, total: 45, onPageChange });

    button("Previous").click();

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("floors totalPages at 1 (both buttons disabled) when total is 0", () => {
    renderPagination({ page: 1, total: 0 });

    expect(screen.getByText("Page 1 of 1 (0 tickets)")).toBeTruthy();
    expect(button("Previous").disabled).toBe(true);
    expect(button("Next").disabled).toBe(true);
  });

  it("renders the singular \"ticket\" for a total of exactly 1", () => {
    renderPagination({ page: 1, total: 1 });

    expect(screen.getByText("Page 1 of 1 (1 ticket)")).toBeTruthy();
  });
});

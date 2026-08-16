import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useTicketsTable } from "@/components/tickets/use-tickets-table";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketListItem, TicketSortableField } from "@/models/ticket.model";

// useTicketsTable's only real logic is translating TanStack Table's
// internal shapes, a SortingState array and a 0-indexed pageIndex, to
// and from the simple onSortChange(field, dir) and onPageChange(page)
// callbacks TicketsView uses for its URL-sync. Everything else is
// TanStack's own, already-tested machinery.
//
// The pageIndex-to-page conversion (0-indexed versus 1-indexed) is the
// most likely spot for an off-by-one. It gets direct coverage here,
// independent of rendering. See tickets-table.test.tsx for the
// rendered, click-driven half of this.
function setup(overrides?: {
  page?: number;
  sortBy?: TicketSortableField;
  sortDir?: "asc" | "desc";
  canAssign?: boolean;
}) {
  const onSortChange = vi.fn();
  const onPageChange = vi.fn();

  const { result } = renderHook(() =>
    useTicketsTable({
      tickets: [],
      total: 0,
      page: overrides?.page ?? 1,
      sortBy: overrides?.sortBy ?? "createdAt",
      sortDir: overrides?.sortDir ?? "desc",
      onSortChange,
      onPageChange,
      canAssign: overrides?.canAssign ?? false,
      agents: [],
      rowSelection: {},
      onRowSelectionChange: vi.fn(),
      onAssignOne: vi.fn(),
      assigningId: null,
    })
  );

  return { table: result.current, onSortChange, onPageChange };
}

// enableRowSelection's predicate reads only row.original off whatever
// it receives, so a minimal stub is enough. The rest of a real
// TanStack Row is irrelevant to this pure-function test. `as never`
// avoids typing out a full Row<...> just to satisfy the parameter
// type, for a value this cast immediately discards anyway.
function ticketRow(status: TicketListItem["status"]) {
  return { original: { status } } as never;
}

describe("useTicketsTable", () => {
  describe("onSortingChange translation", () => {
    it("calls onSortChange with the new field/direction, given a direct SortingState value", () => {
      const { table, onSortChange } = setup({ sortBy: "createdAt", sortDir: "desc" });

      table.options.onSortingChange?.([{ id: "status", desc: false }]);

      expect(onSortChange).toHaveBeenCalledWith("status", "asc");
    });

    it("calls onSortChange correctly when TanStack passes a function updater instead", () => {
      const { table, onSortChange } = setup({ sortBy: "subject", sortDir: "asc" });

      // TanStack's own toggle handler calls onSortingChange with an
      // updater function, not a direct value. It calls that updater
      // with the current controlled `sorting`, the hook's closed-over
      // [{ id: "subject", desc: false }].
      table.options.onSortingChange?.((prev) =>
        prev.map((s) => ({ ...s, desc: !s.desc }))
      );

      expect(onSortChange).toHaveBeenCalledWith("subject", "desc");
    });

    it("does not call onSortChange for an empty sorting array (enableSortingRemoval: false should prevent this, but the handler stays defensive)", () => {
      const { table, onSortChange } = setup();

      table.options.onSortingChange?.([]);

      expect(onSortChange).not.toHaveBeenCalled();
    });
  });

  describe("onPaginationChange translation", () => {
    it("converts a direct 0-indexed pageIndex to a 1-indexed page", () => {
      const { table, onPageChange } = setup({ page: 1 });

      table.options.onPaginationChange?.({ pageIndex: 4, pageSize: 20 });

      expect(onPageChange).toHaveBeenCalledWith(5);
    });

    it("converts a function-updater pageIndex (e.g. from table.nextPage()) correctly", () => {
      const { table, onPageChange } = setup({ page: 3 }); // pageIndex 2

      table.options.onPaginationChange?.((prev) => ({
        ...prev,
        pageIndex: prev.pageIndex + 1,
      }));

      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it("converts pageIndex 0 back to page 1 (the boundary the 1-indexed URL param starts at)", () => {
      const { table, onPageChange } = setup({ page: 5 });

      table.options.onPaginationChange?.({ pageIndex: 0, pageSize: 20 });

      expect(onPageChange).toHaveBeenCalledWith(1);
    });
  });

  it("getRowId uses the ticket's own id, not row index", () => {
    // Selection is keyed by this id. tickets-view.tsx reads
    // Object.keys(rowSelection) straight back out as the bulk-assign
    // payload's ticketIds. An index-based id would silently point at a
    // different ticket after a page or sort change. See this hook's own
    // comment for why.
    const { table } = setup();

    expect(table.options.getRowId?.({ id: "ticket-42" } as TicketListItem, 0)).toBe("ticket-42");
  });

  describe("enableRowSelection", () => {
    it("allows an OPEN ticket when canAssign is true", () => {
      const { table } = setup({ canAssign: true });
      const predicate = table.options.enableRowSelection;

      expect(typeof predicate === "function" ? predicate(ticketRow(TicketStatus.OPEN)) : predicate).toBe(
        true
      );
    });

    it("blocks a RESOLVED ticket even when canAssign is true — only OPEN tickets are assignable", () => {
      const { table } = setup({ canAssign: true });
      const predicate = table.options.enableRowSelection;

      expect(
        typeof predicate === "function" ? predicate(ticketRow(TicketStatus.RESOLVED)) : predicate
      ).toBe(false);
    });

    it("blocks an OPEN ticket when canAssign is false — agents get no selection at all", () => {
      const { table } = setup({ canAssign: false });
      const predicate = table.options.enableRowSelection;

      expect(typeof predicate === "function" ? predicate(ticketRow(TicketStatus.OPEN)) : predicate).toBe(
        false
      );
    });
  });
});

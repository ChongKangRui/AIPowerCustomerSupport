import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useTicketsTable } from "@/components/tickets/use-tickets-table";
import type { TicketSortableField } from "@/models/ticket.model";

// useTicketsTable's only real logic is translating TanStack Table's
// internal shapes (a SortingState array, a 0-indexed pageIndex) to/from the
// simple onSortChange(field, dir)/onPageChange(page) callbacks TicketsView
// uses for its URL-sync — everything else is TanStack's own, already-tested
// machinery. That pageIndex↔page (0-indexed vs 1-indexed) conversion is the
// most likely spot for an off-by-one, so it gets direct coverage here,
// independent of rendering (see tickets-table.test.tsx for the rendered/
// click-driven half of this).
function setup(overrides?: { page?: number; sortBy?: TicketSortableField; sortDir?: "asc" | "desc" }) {
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
    })
  );

  return { table: result.current, onSortChange, onPageChange };
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

      // TanStack's own toggle handler calls onSortingChange with an updater
      // function, not a direct value — the current controlled `sorting` (the
      // hook's closed-over [{ id: "subject", desc: false }]) is what it's
      // called with.
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
});

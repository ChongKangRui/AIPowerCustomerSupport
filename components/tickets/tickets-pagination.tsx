import { Button } from "@/components/ui/button";
import type { useTicketsTable } from "@/components/tickets/use-tickets-table";

// Takes the same shared TanStack Table instance as TicketsTable — no
// pagination math duplicated here; TanStack already computes getPageCount()
// once given rowCount (see useTicketsTable). No pagination primitive exists
// in components/ui/ yet, and this control (Previous/Next + a page label,
// fixed page size) is simple enough not to warrant inventing a generic one
// this round.
export function TicketsPagination({
  table,
  total,
}: {
  table: ReturnType<typeof useTicketsTable>;
  total: number;
}) {
  const pageIndex = table.state.pagination.pageIndex;
  // table.getPageCount() returns 0 when total is 0 (Math.ceil(0 / pageSize))
  // — floor it at 1 so an empty result still reads as "Page 1 of 1" rather
  // than the confusing "Page 1 of 0".
  const pageCount = Math.max(1, table.getPageCount());

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {pageIndex + 1} of {pageCount} ({total} ticket{total === 1 ? "" : "s"})
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

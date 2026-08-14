"use client";

import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import { TICKET_PAGE_SIZE, type TicketListItem, type TicketSortableField } from "@/models/ticket.model";

// @tanstack/react-table's npm `latest` tag is v9 — a rewrite of the v8 API
// (useTable+tableFeatures instead of useReactTable, table.FlexRender
// instead of a standalone flexRender import). This file uses the real v9
// API, confirmed against that package's own docs, not v8 muscle memory.
//
// Only rowSortingFeature/rowPaginationFeature are registered — no
// sortedRowModel/paginatedRowModel. Those two produce CLIENT-side sorted/
// paginated row models; manualSorting/manualPagination below mean "trust
// the server's order and slice as-is, don't recompute them here."
const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });

const columnHelper = createColumnHelper<typeof features, TicketListItem>();

// dateStyle + timeStyle (unlike UsersTable's date-only "Joined" column) —
// ticket recency down to the hour/minute matters more here than a join date
// does for Users.
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function StatusBadge({ status }: { status: TicketListItem["status"] }) {
  const variant =
    status === TicketStatus.OPEN
      ? "destructive"
      : status === TicketStatus.RESOLVED
        ? "secondary"
        : "outline";

  return <Badge variant={variant}>{status}</Badge>;
}

// Column ids for the three sortable columns are deliberately identical to
// TicketSortableField's literal values ("subject" | "status" | "createdAt")
// — TanStack's SortingState entries are `{ id, desc }`, so translating
// between TanStack's sort state and the sortBy/sortDir the URL/API use below
// is a direct mapping, not a lookup table.
//
// Customer/Assigned are display columns (composed from two fields / a
// nullable relation, not a single value) with enableSorting: false — no
// direct Prisma field to sort by, out of scope this round (see
// app/api/tickets/route.ts). Cell rendering lives here, alongside each
// column's identity/sortability, rather than in TicketsTable — that
// component just wraps whatever a column renders in generic table chrome
// (see its own comment).
// columnHelper.columns([...]) (not a bare array) — it normalizes the union
// of accessor/display column def shapes into the single ColumnDef[] type
// useTable expects; a plain array literal here doesn't type-check because
// TS can't widen each entry's distinct accessor value type on its own.
// sortDescFirst: false on every sortable column — without it, TanStack
// infers the first click's direction from each column's data (ascending for
// strings, descending for numbers/dates), which is an implementation detail
// we don't want driving UX, and createdAt's accessor value is itself a
// string (an ISO date), which risks being misclassified. Explicit beats
// inferred: every column's first click is ascending, per design decision #4.
// Widths/cell-text styling live in each column's `meta` (headerClassName/
// cellClassName, read generically by components/ui/data-table.tsx) rather
// than a separate id-keyed lookup map — one less thing to keep in sync with
// the column list above.
const columns = columnHelper.columns([
  columnHelper.accessor("subject", {
    header: "Subject",
    sortDescFirst: false,
    cell: (info) => info.getValue(),
    meta: { headerClassName: "w-[32%]", cellClassName: "truncate font-medium" },
  }),
  columnHelper.display({
    id: "customer",
    header: "Customer",
    enableSorting: false,
    cell: (info) => {
      const ticket = info.row.original;
      return ticket.customerName ? (
        <div className="flex flex-col">
          <span>{ticket.customerName}</span>
          <span className="text-xs text-muted-foreground">{ticket.customerEmail}</span>
        </div>
      ) : (
        ticket.customerEmail
      );
    },
    meta: { headerClassName: "w-[26%]", cellClassName: "truncate" },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    sortDescFirst: false,
    cell: (info) => <StatusBadge status={info.getValue()} />,
    meta: { headerClassName: "w-[14%]" },
  }),
  columnHelper.display({
    id: "assignedTo",
    header: "Assigned",
    enableSorting: false,
    cell: (info) => info.row.original.assignedTo?.name ?? "Unassigned",
    meta: { headerClassName: "w-[16%]", cellClassName: "truncate text-muted-foreground" },
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    sortDescFirst: false,
    cell: (info) => dateFormatter.format(new Date(info.getValue())),
    meta: { headerClassName: "w-[12%]", cellClassName: "text-muted-foreground" },
  }),
]);

type UseTicketsTableArgs = {
  tickets: TicketListItem[];
  total: number;
  page: number;
  sortBy: TicketSortableField;
  sortDir: "asc" | "desc";
  onSortChange: (field: TicketSortableField, dir: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
};

// Single shared TanStack Table instance, built once by TicketsView and
// handed down to both TicketsTable and TicketsPagination — avoids
// constructing two separate table instances or duplicating pagination math
// (TanStack computes getPageCount() itself once given rowCount).
//
// onSortChange/onPageChange are TicketsView's own simple callbacks for its
// URL-sync logic; this hook's only job is translating TanStack's internal
// shapes (0-indexed pageIndex, a SortingState array) to/from them. No
// useSearchParams/useRouter here — URL access stays confined to
// TicketsView.
export function useTicketsTable({
  tickets,
  total,
  page,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
}: UseTicketsTableArgs) {
  const sorting: SortingState = [{ id: sortBy, desc: sortDir === "desc" }];
  const pagination: PaginationState = { pageIndex: page - 1, pageSize: TICKET_PAGE_SIZE };

  return useTable(
    {
      features,
      columns,
      data: tickets,
      manualSorting: true,
      manualPagination: true,
      rowCount: total,
      enableSortingRemoval: false, // no "unsorted" state — backend always has a sortBy
      enableMultiSort: false, // backend only supports a single sort column
      autoResetPageIndex: false, // page is server/URL-driven, not table-internal
      state: { sorting, pagination },
      onSortingChange: (updater) => {
        const [next] = typeof updater === "function" ? updater(sorting) : updater;
        if (next) onSortChange(next.id as TicketSortableField, next.desc ? "desc" : "asc");
      },
      onPaginationChange: (updater) => {
        const next = typeof updater === "function" ? updater(pagination) : updater;
        onPageChange(next.pageIndex + 1);
      },
    },
    (state) => state
  );
}

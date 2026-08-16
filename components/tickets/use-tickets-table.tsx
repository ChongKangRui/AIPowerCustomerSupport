"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronsUpDown } from "lucide-react";

import {
  createColumnHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";

import { StatusBadge } from "@/components/tickets/status-badge";
import { AssignMenu } from "@/components/tickets/assign-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import { TICKET_PAGE_SIZE, type TicketListItem, type TicketSortableField } from "@/models/ticket.model";
import type { UserListItem } from "@/models/user.model";

// @tanstack/react-table's npm `latest` tag is v9, a rewrite of the v8 API.
// It uses useTable and tableFeatures instead of useReactTable, and table.FlexRender instead of a standalone flexRender import.
// This file uses the real v9 API, confirmed against that package's own docs, not v8 muscle memory.
//
// rowSortingFeature and rowPaginationFeature produce CLIENT-side sorted and paginated row models.
// manualSorting and manualPagination below mean "trust the server's order and slice as-is, do not recompute them here."
//
// rowSelectionFeature is different.
// Bulk and per-row assignment (components/tickets/tickets-view.tsx) needs it.
// It has no manual or client-computed row model to opt out of — it is just selection state, an id-to-true map, independent of sorting and pagination.
const features = tableFeatures({ rowSortingFeature, rowPaginationFeature, rowSelectionFeature });

const columnHelper = createColumnHelper<typeof features, TicketListItem>();

// This uses dateStyle and timeStyle, unlike UsersTable's date-only "Joined" column.
// Ticket recency down to the hour and minute matters more here than a join date does for Users.
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Column defs now depend on props.
// canAssign, agents, onAssignOne, and assigningId govern the select column's presence and the assignedTo cell's interactivity.
// So, unlike the old module-level `const columns`, this is a function.
// The hook below calls and memoizes it. It is not a stable top-level constant.
function buildColumns({
  canAssign,
  agents,
  onAssignOne,
  assigningId,
}: {
  canAssign: boolean;
  agents: UserListItem[];
  onAssignOne: (ticketId: string, assignedToId: string | null) => void;
  assigningId: string | null;
}) {
  return columnHelper.columns([
    // Only admins ever see this column at all.
    // enableRowSelection (in useTicketsTable below) also gates on canAssign as a second layer.
    // But there is no point rendering a checkbox column for agents in the first place.
    ...(canAssign
      ? [
          columnHelper.display({
            id: "select",
            header: (info) => (
              <Checkbox
                checked={
                  info.table.getIsAllPageRowsSelected()
                    ? true
                    : info.table.getIsSomePageRowsSelected()
                      ? "indeterminate"
                      : false
                }
                // The row-selection feature's own docs call for this: bind the handler to onClick, not a boolean onCheckedChange.
                // That keeps Shift-range selection's modifier-key detection working.
                // See node_modules/@tanstack/table-core/skills/row-selection/SKILL.md's "Bypassing the range-selection handler" common mistake.
                onClick={info.table.getToggleAllPageRowsSelectedHandler()}
                aria-label="Select all open tickets on this page"
              />
            ),
            cell: (info) => (
              <Checkbox
                checked={info.row.getIsSelected()}
                disabled={!info.row.getCanSelect()}
                onClick={info.row.getToggleSelectedHandler()}
                aria-label={`Select ${info.row.original.subject}`}
              />
            ),
            meta: { headerClassName: "w-10", cellClassName: "w-10" },
          }),
        ]
      : []),
    columnHelper.accessor("subject", {
      header: "Subject",
      sortDescFirst: false,
      // This links to the detail page (app/(main)/tickets/[id]/page.tsx).
      // It links just the subject text, not the whole row.
      // TanStack's sortable-header click handling already lives one level up in DataTable.
      // This is the only interactive element inside a data cell in this table.
      cell: (info) => (
        <Link href={`/tickets/${info.row.original.id}`} className="hover:underline">
          {info.getValue()}
        </Link>
      ),
      meta: { headerClassName: canAssign ? "w-[28%]" : "w-[32%]", cellClassName: "truncate font-medium" },
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
      meta: { headerClassName: canAssign ? "w-[22%]" : "w-[26%]", cellClassName: "truncate" },
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
      cell: (info) => {
        const ticket = info.row.original;
        const label = ticket.assignedTo?.name ?? "Unassigned";

        // This stays read-only for agents, and for any ticket that is not OPEN.
        // That is the same eligibility rule the server enforces (app/api/tickets/[id]/assign/route.ts), mirrored here just to decide whether to show the control at all.
        if (!canAssign || ticket.status !== TicketStatus.OPEN) {
          return label;
        }

        const isAssigning = assigningId === ticket.id;
        return (
          <AssignMenu
            agents={agents}
            value={ticket.assignedTo?.id ?? null}
            onAssign={(assignedToId) => onAssignOne(ticket.id, assignedToId)}
            disabled={isAssigning}
          >
            <button
              type="button"
              disabled={isAssigning}
              className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50"
            >
              {isAssigning ? "Assigning…" : label}
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
          </AssignMenu>
        );
      },
      meta: { headerClassName: "w-[16%]", cellClassName: "truncate text-muted-foreground" },
    }),
    columnHelper.accessor("createdAt", {
      header: "Created",
      sortDescFirst: false,
      cell: (info) => dateFormatter.format(new Date(info.getValue())),
      meta: { headerClassName: "w-[12%]", cellClassName: "text-muted-foreground" },
    }),
  ]);
}

type UseTicketsTableArgs = {
  tickets: TicketListItem[];
  total: number;
  page: number;
  sortBy: TicketSortableField;
  sortDir: "asc" | "desc";
  onSortChange: (field: TicketSortableField, dir: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
  // These assignment fields are all admin-only.
  // When canAssign is false, the columns and state below just do nothing selection-related.
  // See tickets-view.tsx for where isAdmin, agents, and rowSelection actually live.
  canAssign: boolean;
  agents: UserListItem[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void;
  onAssignOne: (ticketId: string, assignedToId: string | null) => void;
  assigningId: string | null;
};

// This is a single shared TanStack Table instance.
// TicketsView builds it once and hands it down to both TicketsTable and TicketsPagination.
// That avoids constructing two separate table instances or duplicating pagination math — TanStack computes getPageCount() itself, once, given rowCount.
//
// onSortChange and onPageChange are TicketsView's own simple callbacks for its URL-sync logic.
// This hook's only job is translating TanStack's internal shapes — a 0-indexed pageIndex, a SortingState array — to and from them.
// This hook has no useSearchParams or useRouter. URL access stays confined to TicketsView.
export function useTicketsTable({
  tickets,
  total,
  page,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
  canAssign,
  agents,
  rowSelection,
  onRowSelectionChange,
  onAssignOne,
  assigningId,
}: UseTicketsTableArgs) {
  const sorting: SortingState = [{ id: sortBy, desc: sortDir === "desc" }];
  const pagination: PaginationState = { pageIndex: page - 1, pageSize: TICKET_PAGE_SIZE };

  const columns = useMemo(
    () => buildColumns({ canAssign, agents, onAssignOne, assigningId }),
    [canAssign, agents, onAssignOne, assigningId]
  );

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
      // This uses the ticket id, not the row index.
      // row-selection's own docs flag index-based ids as a "HIGH" mistake under manual pagination.
      // A selected "row 3" would silently mean a different ticket after paging or sorting.
      //
      // Ticket ids are also exactly what the bulk-assign payload needs.
      // So Object.keys(rowSelection) in tickets-view.tsx doubles as the ticketIds array, with no extra mapping.
      getRowId: (ticket) => ticket.id,
      enableRowSelection: (row) => canAssign && row.original.status === TicketStatus.OPEN,
      state: { sorting, pagination, rowSelection },
      onRowSelectionChange,
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

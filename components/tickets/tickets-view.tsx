"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RowSelectionState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTickets } from "@/hooks/use-tickets";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useUsers } from "@/hooks/use-users";
import { useBulkAssignTickets } from "@/hooks/use-bulk-assign-tickets";
import { useTicketsTable } from "@/components/tickets/use-tickets-table";
import { AssignMenu } from "@/components/tickets/assign-menu";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { TicketsTableSkeleton } from "@/components/tickets/tickets-table-skeleton";
import { TicketsPagination } from "@/components/tickets/tickets-pagination";
import { Role } from "@/lib/generated/prisma/enums";
import {
  ticketListQuerySchema,
  type TicketSortableField,
  type TicketStatusFilter,
} from "@/models/ticket.model";

type FilterState = { status: TicketStatusFilter; q: string };
type SortState = { sortBy: TicketSortableField; sortDir: "asc" | "desc" };

// How long a pause in typing has to last before the subject search actually
// fires a request — see hooks/use-debounced-value.ts.
const SEARCH_DEBOUNCE_MS = 700;

// Owns the URL as the source of truth for page/sort/status/q — nothing else
// in this codebase writes to the URL (app/login/login-form.tsx only ever
// reads callbackUrl once). Reusing ticketListQuerySchema (the same schema
// GET /api/tickets validates with) to parse searchParams means client and
// server can't drift on defaults/fallback behavior for a hand-edited or
// stale query string.
export function TicketsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { page, sortBy, sortDir, status, q } = ticketListQuerySchema.parse(
    Object.fromEntries(searchParams)
  );

  function updateParams(next: Partial<SortState & FilterState & { page: number }>) {
    const merged = { page, sortBy, sortDir, status, q, ...next };
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(merged.page));
    params.set("sortBy", merged.sortBy);
    params.set("sortDir", merged.sortDir);
    // status/q are omitted from the URL entirely at their "no filter"
    // default ("ALL" / "") rather than written out explicitly — keeps a
    // plain unfiltered /tickets URL clean, and means the schema's own
    // defaults (models/ticket.model.ts) are the only place "no filter"
    // is spelled out.
    if (merged.status === "ALL") params.delete("status");
    else params.set("status", merged.status);
    if (merged.q) params.set("q", merged.q);
    else params.delete("q");

    // replace, not push — same reasoning as login-form.tsx's use of
    // replace: paging/sorting/filtering through a list shouldn't fill
    // browser history with one entry per interaction. scroll: false so it
    // doesn't jerk the viewport to the top of a scrolled table.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Local echo of the search box — typing has to feel instant even though
  // the URL/API call it drives is debounced. Re-synced from `q` whenever it
  // changes (not just seeded once) so browser back/forward or a pasted link
  // with a different `q` correctly overwrites whatever's mid-type; harmless
  // when it's this component's own debounced commit echoing back, since the
  // two values already match by then. "Adjusting state during render" (React's
  // own recommended pattern for this — https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than a useEffect mirroring `q` into state, which the project's
  // react-hooks/set-state-in-effect lint rule flags as an error.
  const [searchInput, setSearchInput] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    setSearchInput(q);
  }

  // Bulk-select state for the admin-only assign toolbar (below) — keyed by
  // ticket id (see use-tickets-table.tsx's getRowId), not row index.
  // Page/filter-scoped by design (confirmed with the user over persisting
  // selection across pages): reset via the same "adjust state during
  // render" pattern as searchInput/syncedQ above — not a useEffect, which
  // would mean calling setRowSelection from inside an effect (flagged by
  // this project's react-hooks/set-state-in-effect lint rule) and would
  // also miss resets triggered by browser back/forward, which don't run
  // updateParams at all.
  const paramsKey = `${page}|${sortBy}|${sortDir}|${status}|${q}`;
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [syncedParamsKey, setSyncedParamsKey] = useState(paramsKey);
  if (paramsKey !== syncedParamsKey) {
    setSyncedParamsKey(paramsKey);
    setRowSelection({});
  }

  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (debouncedSearch !== q) updateParams({ q: debouncedSearch, page: 1 });
    // Only the debounced value should retrigger this — updateParams/q are
    // read fresh from the current render's closure each time it actually
    // fires, and the `!==` guard makes any extra re-run from an unrelated
    // render a no-op rather than a redundant navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { tickets, total, isLoading, isError } = useTickets({ page, sortBy, sortDir, status, q });

  const { user } = useCurrentUser();
  const isAdmin = user?.role === Role.ADMIN;
  // Only fetched for admins — see hooks/use-users.ts's `enabled` param
  // comment; agents never render anything that needs this list.
  const { users: agents } = useUsers({ enabled: isAdmin });

  const bulkAssign = useBulkAssignTickets();
  // Which single ticket's assign mutation is in flight, for the per-row
  // "Assigning…" state — bulkAssign.isPending alone can't distinguish a
  // one-row assign from a many-row one, since both go through the same
  // mutation (see hooks/use-bulk-assign-tickets.ts's comment on why).
  const [assigningId, setAssigningId] = useState<string | null>(null);

  function handleAssignOne(ticketId: string, assignedToId: string | null) {
    setAssigningId(ticketId);
    bulkAssign.mutate(
      { ticketIds: [ticketId], assignedToId },
      { onSettled: () => setAssigningId(null) }
    );
  }

  function handleBulkAssign(assignedToId: string | null) {
    bulkAssign.mutate(
      { ticketIds: Object.keys(rowSelection), assignedToId },
      { onSuccess: () => setRowSelection({}) }
    );
  }

  const table = useTicketsTable({
    tickets,
    total,
    page,
    sortBy,
    sortDir,
    // Sorting a new/different column always jumps back to page 1 — the
    // page the user was on may not even exist under the new order.
    onSortChange: (field, dir) => updateParams({ sortBy: field, sortDir: dir, page: 1 }),
    onPageChange: (nextPage) => updateParams({ page: nextPage }),
    canAssign: isAdmin,
    agents,
    rowSelection,
    onRowSelectionChange: setRowSelection,
    onAssignOne: handleAssignOne,
    assigningId,
  });

  const hasActiveFilters = status !== "ALL" || q !== "";
  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by subject…"
          aria-label="Search tickets"
          className="max-w-xs"
        />
        <select
          value={status}
          onChange={(event) =>
            updateParams({ status: event.target.value as TicketStatusFilter, page: 1 })
          }
          aria-label="Filter by status"
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="ALL">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Admin-only bulk assign toolbar — only shown once at least one
          (necessarily OPEN, per enableRowSelection in use-tickets-table.tsx)
          row is checked. */}
      {isAdmin && selectedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {selectedCount} ticket{selectedCount === 1 ? "" : "s"} selected
          </span>
          <AssignMenu
            agents={agents}
            value={null}
            onAssign={handleBulkAssign}
            disabled={bulkAssign.isPending}
          >
            <Button variant="secondary" size="sm" disabled={bulkAssign.isPending}>
              {bulkAssign.isPending ? "Assigning…" : "Assign to…"}
            </Button>
          </AssignMenu>
          <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
            Clear
          </Button>
          {bulkAssign.error && (
            <p role="alert" className="text-destructive">
              {bulkAssign.error.message}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <TicketsTableSkeleton />
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load tickets.</p>
      ) : (
        <>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {total === 0 && !hasActiveFilters
                ? "No tickets yet."
                : total === 0
                  ? "No tickets match your filters."
                  : "No tickets on this page."}
            </p>
          ) : (
            <TicketsTable table={table} />
          )}
          {/* Kept visible even when this specific page is empty (page
              beyond the last one — see ticketListQuerySchema's comment on
              why that's not clamped server-side) so Previous stays
              reachable instead of stranding the user on a dead page. */}
          {total > 0 && <TicketsPagination table={table} total={total} />}
        </>
      )}
    </div>
  );
}

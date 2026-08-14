"use client";

import { useTickets } from "@/hooks/use-tickets";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { TicketsTableSkeleton } from "@/components/tickets/tickets-table-skeleton";

// No search/filter controls yet, unlike UsersView — this is the basic
// list+sort increment of Phase 3 (implementation-plan.md); status/assigned
// agent filtering is a deliberately separate, later increment, not an
// oversight here.
export function TicketsView() {
  const { tickets, isLoading, isError } = useTickets();

  return (
    <div className="flex flex-1 flex-col gap-4">
      {isLoading ? (
        <TicketsTableSkeleton />
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load tickets.</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tickets yet.</p>
      ) : (
        <TicketsTable tickets={tickets} />
      )}
    </div>
  );
}

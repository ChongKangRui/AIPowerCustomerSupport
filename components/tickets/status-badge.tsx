import { Badge } from "@/components/ui/badge";
import { TicketStatus } from "@/lib/generated/prisma/enums";

// Shared between components/tickets/use-tickets-table.tsx (list column) and
// components/tickets/ticket-detail-header.tsx (detail page) — pulled out of
// use-tickets-table.tsx since it's genuinely reusable ticket-status UI, not
// something specific to that table's column defs; a hook file named
// "use-tickets-table" was the wrong home for a second, unrelated caller to
// import a component from.
export function StatusBadge({ status }: { status: TicketStatus }) {
  const variant =
    status === TicketStatus.OPEN
      ? "destructive"
      : status === TicketStatus.RESOLVED
        ? "secondary"
        : "outline";

  return <Badge variant={variant}>{status}</Badge>;
}

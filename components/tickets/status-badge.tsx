import { Badge } from "@/components/ui/badge";
import { TicketStatus } from "@/lib/generated/prisma/enums";

// Both components/tickets/use-tickets-table.tsx (the list column) and components/tickets/ticket-detail-header.tsx (the detail page) share this.
//
// This is pulled out of use-tickets-table.tsx, since it is genuinely reusable ticket-status UI, not something specific to that table's column defs.
// A hook file named "use-tickets-table" was the wrong home for a second, unrelated caller to import a component from.
export function StatusBadge({ status }: { status: TicketStatus }) {
  const variant =
    status === TicketStatus.OPEN
      ? "destructive"
      : status === TicketStatus.RESOLVED
        ? "secondary"
        : "outline";

  return <Badge variant={variant}>{status}</Badge>;
}

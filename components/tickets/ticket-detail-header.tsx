import Link from "next/link";

import { StatusBadge } from "@/components/tickets/status-badge";
import type { TicketDetail } from "@/models/ticket.model";

// Header block of the ticket detail page — back link, subject/status, and
// the customer/assignee summary line. Split out of
// ticket-detail-view.tsx so that component's job stays "fetch the ticket +
// orchestrate the page's sections" rather than also owning this markup.
export function TicketDetailHeader({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/tickets" className="text-sm text-muted-foreground hover:underline">
        ← Back to tickets
      </Link>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          <StatusBadge status={ticket.status} />
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1.5">
            <dt className="font-medium text-foreground">Customer</dt>
            <dd>
              {ticket.customerName
                ? `${ticket.customerName} · ${ticket.customerEmail}`
                : ticket.customerEmail}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-medium text-foreground">Assigned to</dt>
            <dd>{ticket.assignedTo?.name ?? "Unassigned"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

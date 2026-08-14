"use client";

import Link from "next/link";
import { ChevronsUpDown } from "lucide-react";

import { StatusBadge } from "@/components/tickets/status-badge";
import { AssignMenu } from "@/components/tickets/assign-menu";
import { Button } from "@/components/ui/button";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketDetail } from "@/models/ticket.model";
import type { UserListItem } from "@/models/user.model";

// Header block of the ticket detail page — back link, subject/status, and
// the customer/assignee summary line. Split out of
// ticket-detail-view.tsx so that component's job stays "fetch the ticket +
// orchestrate the page's sections" rather than also owning this markup.
//
// "use client" was added for the AssignMenu dropdown below — everything
// else here is still plain markup, but this is the file rendering the one
// interactive element. isAdmin/agents/onAssign/assignPending are all owned
// by ticket-detail-view.tsx (which already holds the equivalent
// useUpdateTicketStatus mutation for Mark Resolved/Close) and just passed
// through; assignment is only ever offered for OPEN tickets (see
// app/api/tickets/[id]/assign/route.ts, the actual enforcement) and only to
// admins (see project-scope.md).
export function TicketDetailHeader({
  ticket,
  isAdmin,
  agents,
  onAssign,
  assignPending,
  assignError,
}: {
  ticket: TicketDetail;
  isAdmin: boolean;
  agents: UserListItem[];
  onAssign: (assignedToId: string | null) => void;
  assignPending: boolean;
  assignError?: string | null;
}) {
  const canAssign = isAdmin && ticket.status === TicketStatus.OPEN;

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
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1.5">
            <dt className="font-medium text-foreground">Customer</dt>
            <dd>
              {ticket.customerName
                ? `${ticket.customerName} · ${ticket.customerEmail}`
                : ticket.customerEmail}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="font-medium text-foreground">Assigned to</dt>
            {canAssign ? (
              <dd>
                <AssignMenu
                  agents={agents}
                  value={ticket.assignedTo?.id ?? null}
                  onAssign={onAssign}
                  disabled={assignPending}
                >
                  <Button variant="outline" size="sm" disabled={assignPending}>
                    {assignPending ? "Assigning…" : (ticket.assignedTo?.name ?? "Unassigned")}
                    <ChevronsUpDown className="text-muted-foreground" />
                  </Button>
                </AssignMenu>
              </dd>
            ) : (
              <dd>{ticket.assignedTo?.name ?? "Unassigned"}</dd>
            )}
          </div>
        </dl>
        {assignError && (
          <p role="alert" className="text-sm text-destructive">
            {assignError}
          </p>
        )}
      </div>
    </div>
  );
}

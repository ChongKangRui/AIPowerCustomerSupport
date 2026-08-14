import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketListItem } from "@/models/ticket.model";

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

export function TicketsTable({ tickets }: { tickets: TicketListItem[] }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[32%]">Subject</TableHead>
          <TableHead className="w-[26%]">Customer</TableHead>
          <TableHead className="w-[14%]">Status</TableHead>
          <TableHead className="w-[16%]">Assigned</TableHead>
          <TableHead className="w-[12%]">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell className="truncate font-medium">{ticket.subject}</TableCell>
            <TableCell className="truncate">
              {ticket.customerName ? (
                <div className="flex flex-col">
                  <span>{ticket.customerName}</span>
                  <span className="text-xs text-muted-foreground">{ticket.customerEmail}</span>
                </div>
              ) : (
                ticket.customerEmail
              )}
            </TableCell>
            <TableCell>
              <StatusBadge status={ticket.status} />
            </TableCell>
            <TableCell className="truncate text-muted-foreground">
              {ticket.assignedTo?.name ?? "Unassigned"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {dateFormatter.format(new Date(ticket.createdAt))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

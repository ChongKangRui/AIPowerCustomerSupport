import { TicketsView } from "@/components/tickets/tickets-view";

// Both Admin and Agent view this page — unlike app/(main)/users/page.tsx,
// there's no role redirect here. app/(main)/layout.tsx already guarantees a
// valid session before this renders, and visibility scoping (Admin sees all
// tickets, Agent sees only their own assigned ones) is enforced server-side
// in GET /api/tickets, not here — don't "fix" this by adding a role check.
export default function TicketsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Tickets</h1>
      <TicketsView />
    </div>
  );
}

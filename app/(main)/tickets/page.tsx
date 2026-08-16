import { Suspense } from "react";

import { TicketsView } from "@/components/tickets/tickets-view";
import { TicketsTableSkeleton } from "@/components/tickets/tickets-table-skeleton";

// Both Admin and Agent view this page. Unlike app/(main)/users/page.tsx, there is no role redirect here.
// app/(main)/layout.tsx already guarantees a valid session before this renders.
// Visibility scoping — Admin sees all tickets, Agent sees only their own assigned ones — is enforced server-side in GET /api/tickets instead. Do not "fix" this by adding a role check here.
//
// TicketsView reads page and sort state through next/navigation's useSearchParams(), which Next.js requires to sit under a Suspense boundary.
// The fallback below reuses TicketsView's own loading skeleton, so this does not change the loading UX. It just satisfies the boundary requirement.
export default function TicketsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Tickets</h1>
      <Suspense fallback={<TicketsTableSkeleton />}>
        <TicketsView />
      </Suspense>
    </div>
  );
}

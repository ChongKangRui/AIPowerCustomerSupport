import { TicketDetailView } from "@/components/tickets/ticket-detail-view";

// Thin server component, same shape as app/(main)/tickets/page.tsx — no role
// redirect here either, same reasoning as that page's own comment:
// app/(main)/layout.tsx already guarantees a valid session, and
// GET/PATCH /api/tickets/[id] are the sole authoritative enforcement of
// "Agents only see/act on their own assigned tickets", not this page. `id`
// only needs to reach TicketDetailView; there's no server-side data fetch
// here to justify awaiting it any earlier.
export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <TicketDetailView ticketId={id} />
    </div>
  );
}

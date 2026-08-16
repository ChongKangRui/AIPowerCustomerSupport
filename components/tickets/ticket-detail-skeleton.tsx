import { Skeleton } from "@/components/ui/skeleton";

// This is the loading fallback for ticket-detail-view.tsx while useTicket() is pending.
// It uses the same Skeleton-block approach as tickets-table-skeleton.tsx, shaped to this page's header and conversation-thread layout instead of a table.
export function TicketDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

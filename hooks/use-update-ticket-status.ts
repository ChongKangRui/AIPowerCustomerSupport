"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketDetail } from "@/models/ticket.model";

// Detail page's Mark Resolved/Close mutation (ticket-detail-view.tsx) — same
// TanStack Query + apiClient pattern as useUpdateUser
// (hooks/use-update-user.ts). Invalidates both ["ticket", id] (so the detail
// page itself picks up the new status/resolvedAt/closedAt) and ["tickets"]
// (so a Back navigation to the list shows the updated status without a
// manual refetch — same cross-cutting-invalidation reasoning as
// useUpdateUser's ["session"] invalidation).
export function useUpdateTicketStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: "RESOLVED" | "CLOSED") =>
      apiClient.patch<TicketDetail>(`/api/tickets/${id}`, { status }).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketDetail } from "@/models/ticket.model";

// This is the detail page's Mark Resolved/Close mutation (ticket-detail-view.tsx).
// It uses the same TanStack Query and apiClient pattern as useUpdateUser (hooks/use-update-user.ts).
//
// It invalidates both query keys.
// ["ticket", id] lets the detail page itself pick up the new status, resolvedAt, and closedAt.
// ["tickets"] lets a Back navigation to the list show the updated status without a manual refetch.
// This is the same cross-cutting-invalidation reasoning as useUpdateUser's ["session"] invalidation.
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

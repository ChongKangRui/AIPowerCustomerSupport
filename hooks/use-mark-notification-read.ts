"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

// Backs a single notification-item click in the bell dropdown
// (components/notifications/notification-bell.tsx). Invalidates
// ["notifications"] so the badge count and list both refresh — the next
// poll would eventually catch up anyway, but this makes the read state
// (and badge decrement) feel instant instead of waiting up to 20s.
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

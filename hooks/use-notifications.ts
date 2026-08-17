"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { NotificationListResponse } from "@/models/notification.model";

// First `refetchInterval` in this codebase — every other hook here only
// refetches on-demand (mutation success, refocus), but a notification
// can be created by *someone else's* action, with no local mutation to
// invalidate off of. 20s mirrors the same no-push-infra polling choice
// tech-stack.md made for Gmail ingestion (hooks/use-sync-gmail.ts).
const NOTIFICATION_POLL_INTERVAL_MS = 20_000;

// No `enabled` flag here, unlike some other hooks in this codebase
// (e.g. useUsers({ enabled: isAdmin })) — components/navbar.tsx only
// mounts <NotificationBell /> once `user` is truthy in the first place,
// so gating the query itself a second time would be redundant.
export function useNotifications() {
  const { data, isSuccess } = useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) =>
      apiClient
        .get<NotificationListResponse>("/api/notifications", { signal })
        .then((res) => res.data),
    refetchInterval: NOTIFICATION_POLL_INTERVAL_MS,
  });

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    // isSuccess, not isLoading — see notification-bell.tsx's toast
    // effect for why (isLoading can go false with no data yet).
    isSuccess,
  };
}

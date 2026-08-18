"use client";

import { useEffect, useRef } from "react";

import { Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMarkAllNotificationsRead } from "@/hooks/use-mark-all-notifications-read";
import { useMarkNotificationRead } from "@/hooks/use-mark-notification-read";
import { useNotifications } from "@/hooks/use-notifications";
import type { NotificationItem } from "@/models/notification.model";

// Mirrors ticket-conversation.tsx's own module-level Intl.DateTimeFormat
// convention — this codebase formats timestamps directly rather than
// pulling in a relative-time ("3m ago") library.
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notifications, unreadCount, isSuccess } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Tracks which notification ids this tab has already toasted, so
  // nothing flashes twice. Starts `null` (not an empty Set) so the
  // effect below can tell "first load" apart from "nothing new" — first
  // load seeds silently, so an existing backlog doesn't toast-storm.
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    // isSuccess, not isLoading: isLoading goes false again as soon as
    // any fetch attempt settles, even a failed one with no data — that
    // gap let a transient first-load failure seed seenIds off the empty
    // fallback, then toast-storm once real data arrived later.
    // isSuccess only turns true once real data has landed. Full story:
    // error-log.txt, 2026-08-17.
    if (!isSuccess) return;

    if (seenIds.current === null) {
      seenIds.current = new Set(notifications.map((n) => n.id));
      return;
    }

    for (const notification of notifications) {
      if (!seenIds.current.has(notification.id) && notification.readAt === null) {
        seenIds.current.add(notification.id);
        toast(notification.message);

        // The ticket's server state just changed — invalidate its cache
        // too, so an already-open list/detail page doesn't keep showing
        // stale data (staleTime is 60s, app/providers.tsx).
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["ticket", notification.ticketId] });
      }
    }
  }, [notifications, isSuccess, queryClient]);

  function handleSelect(notification: NotificationItem) {
    if (!notification.readAt) markRead.mutate(notification.id);
    router.push(`/tickets/${notification.ticketId}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-8 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {/* Header sits outside the scrollable list below — as a footer
            item it used to need scrolling past everything to reach,
            which looked like it had disappeared. */}
        <div className="flex items-center justify-between gap-2">
          <DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <DropdownMenuItem
              onSelect={() => markAllRead.mutate()}
              className="w-fit shrink-0 text-xs text-muted-foreground"
            >
              Mark all as read
            </DropdownMenuItem>
          )}
        </div>
        <DropdownMenuSeparator />

        {/* Only the list scrolls, capped at a fixed height — the header stays put. */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-1.5 py-4 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onSelect={() => handleSelect(notification)}
                className="flex flex-col items-start gap-0.5 whitespace-normal"
              >
                <span className={notification.readAt ? "text-muted-foreground" : "font-medium"}>
                  {notification.message}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dateFormatter.format(new Date(notification.createdAt))}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

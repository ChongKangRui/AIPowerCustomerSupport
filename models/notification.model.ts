import type { NotificationType } from "@/lib/generated/prisma/enums";

// This is the wire shape of a notification from GET /api/notifications.
// NextResponse.json() turns createdAt/readAt into ISO strings (or null).
// This is not the raw Prisma row — it deliberately omits userId, since
// the route only ever returns the caller's own notifications.
//
// Mirrors models/ticket.model.ts's TicketListItem comment: a plain types
// module, so hooks/use-notifications.ts and components/notifications/*
// don't reach into a Route Handler file.
export type NotificationItem = {
  id: string;
  ticketId: string;
  type: NotificationType;
  message: string;
  readAt: string | null;
  createdAt: string;
};

// This value is fixed, the same way TICKET_PAGE_SIZE is in
// models/ticket.model.ts. The bell dropdown shows "recent" notifications,
// not a paginated history — there's no product need for one yet.
export const NOTIFICATION_LIST_LIMIT = 10;

// How long a *read* notification survives before GET /api/notifications
// opportunistically deletes it (that route's own comment explains why
// this is a lazy prune, not a separate cron job). Unread notifications
// are never touched, at any age.
export const NOTIFICATION_RETENTION_DAYS = 30;

export type NotificationListResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

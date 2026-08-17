import { NextResponse } from "next/server";

import { UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_LIST_LIMIT, NOTIFICATION_RETENTION_DAYS } from "@/models/notification.model";

const RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// Personal endpoint — always session.user.id, no admin bypass (unlike
// GET /api/tickets). Three small indexed queries in one round trip: the
// most recent NOTIFICATION_LIST_LIMIT notifications, a separate unread
// count (there can be more unread than the list shows), and an
// opportunistic prune of old *read* notifications
// (NOTIFICATION_RETENTION_DAYS). Polled every 20s
// (hooks/use-notifications.ts), so it stays cheap.
export const GET = withApiHandler(async (_request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();

  const [notifications, unreadCount, pruned] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_LIST_LIMIT,
      select: {
        id: true,
        ticketId: true,
        type: true,
        message: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    }),
    // Opportunistic retention — piggybacks on this poll instead of a
    // separate cron job (see NOTIFICATION_RETENTION_DAYS).
    prisma.notification.deleteMany({
      where: {
        userId: session.user.id,
        readAt: { not: null, lt: new Date(Date.now() - RETENTION_MS) },
      },
    }),
  ]);

  log.info(
    { count: notifications.length, unreadCount, pruned: pruned.count },
    "fetched notifications"
  );
  return NextResponse.json({ notifications, unreadCount });
});

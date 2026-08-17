import { NextResponse } from "next/server";

import { NotFoundError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

// PATCH /api/notifications/[id]/read marks one notification read. The
// bell dropdown calls this when the agent clicks a notification, right
// before navigating to its ticket.
//
// Scoped to `userId: session.user.id` in the same `where`, not a
// separate ownership check after a plain findUnique — that way a
// mismatched id (someone else's notification) 404s exactly like a
// nonexistent one, instead of leaking whether the id exists at all.
//
// Idempotent: re-marking an already-read notification just no-ops
// (readAt stays at its original timestamp), since `where` only matches
// rows where readAt is still null.
export const PATCH = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (_request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;

    const result = await prisma.notification.updateMany({
      where: { id, userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      // Either the notification doesn't exist, belongs to someone else,
      // or was already read. Treat the already-read case as success too
      // — the caller's goal ("make sure this is read") is already true.
      const existing = await prisma.notification.findFirst({
        where: { id, userId: session.user.id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError("Notification not found");
    }

    log.info({ notificationId: id }, "marked notification read");
    return NextResponse.json({ ok: true });
  }
);

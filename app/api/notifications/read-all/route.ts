import { NextResponse } from "next/server";

import { UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

// PATCH /api/notifications/read-all backs the bell dropdown's "Mark all
// as read" button. One updateMany, scoped to the caller — no id list to
// pass, no ownership check needed beyond the `userId` filter itself.
export const PATCH = withApiHandler(async (_request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();

  const result = await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  log.info({ count: result.count }, "marked all notifications read");
  return NextResponse.json({ count: result.count });
});

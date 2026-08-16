import { NextResponse } from "next/server";

import { UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { bootstrapHistoryId, pollGmailAndCreateTickets } from "@/lib/gmail";

// GET /api/cron/poll-gmail is the endpoint an external scheduled-ping service — cron-job.org, per tech-stack.md's Email section — hits to poll Gmail on a schedule.
//
// This is bearer-secret protected, not session-based.
// This request never carries a browser session cookie, so the `session` arg withApiHandler hands every route is simply unused here, the same as health-check/route.ts.
export const GET = withApiHandler(async (request, _context, log) => {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (request.headers.get("authorization") !== expected) {
    throw new UnauthorizedError();
  }

  // This is an idempotent no-op after the very first call, safe to call on every run instead of requiring a separate one-time bootstrap step in production.
  await bootstrapHistoryId();
  const stats = await pollGmailAndCreateTickets();

  log.info(stats, "cron: Gmail poll complete");
  return NextResponse.json(stats);
});

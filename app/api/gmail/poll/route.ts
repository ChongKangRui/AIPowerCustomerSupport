import { NextResponse } from "next/server";

import { UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { bootstrapHistoryId, pollGmailAndCreateTickets } from "@/lib/gmail";

// POST /api/gmail/poll is the manual "Fetch Gmail" trigger, from tickets-view.tsx's toolbar button.
// It stands in for a fast cron cadence on this portfolio project. See tech-stack.md's Email section and implementation-plan.md Phase 2.
//
// Any authenticated user, Admin or Agent, can trigger it.
// This is a read/sync action, not a privileged mutation, the same philosophy as GET /api/tickets rather than the admin-only assign endpoints.
//
// This is session-authenticated, unlike the bearer-secret cron route (app/api/cron/poll-gmail/route.ts).
// This stays a separate route rather than sharing one, since the auth mechanism genuinely differs.
export const POST = withApiHandler(async (_request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();

  await bootstrapHistoryId();
  const stats = await pollGmailAndCreateTickets();

  log.info({ userId: session.user.id, ...stats }, "manual Gmail poll complete");
  return NextResponse.json(stats);
});

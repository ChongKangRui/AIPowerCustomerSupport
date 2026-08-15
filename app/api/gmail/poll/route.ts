import { NextResponse } from "next/server";

import { UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { bootstrapHistoryId, pollGmailAndCreateTickets } from "@/lib/gmail";

// POST /api/gmail/poll — manual "Fetch Gmail" trigger (tickets-view.tsx's
// toolbar button), standing in for a fast cron cadence on this portfolio
// project (see tech-stack.md's Email section / implementation-plan.md
// Phase 2). Any authenticated user (Admin or Agent) can trigger it — this is
// a read/sync action, not a privileged mutation, same philosophy as
// GET /api/tickets rather than the admin-only assign endpoints. Session-
// authenticated, unlike the bearer-secret cron route
// (app/api/cron/poll-gmail/route.ts) — kept as a separate route rather than
// sharing one, since the auth mechanism genuinely differs.
export const POST = withApiHandler(async (_request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();

  await bootstrapHistoryId();
  const stats = await pollGmailAndCreateTickets();

  log.info({ userId: session.user.id, ...stats }, "manual Gmail poll complete");
  return NextResponse.json(stats);
});

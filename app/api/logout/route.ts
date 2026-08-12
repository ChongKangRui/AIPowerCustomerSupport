import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api-handler";
import { destroyUserSession } from "@/lib/session";

// POST /api/logout — ends the current database session, if any. Always
// succeeds: logging out while already logged out is a no-op, not an error.
export const POST = withApiHandler(async (_request, _context, log) => {
  await destroyUserSession();

  log.info("logout succeeded");
  return NextResponse.json({ success: true });
});

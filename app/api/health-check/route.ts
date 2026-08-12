import { NextRequest, NextResponse } from "next/server";

import { HttpError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

// GET /api/health-check — confirms the app is up and can reach the database.
export const GET = withApiHandler(async (_request, _context, log) => {
  log.debug("pinging database");

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    // A DB outage is a known, specific failure mode — 503, not a generic 500.
    throw new HttpError(503, "Database unreachable", { cause: error });
  }

  return NextResponse.json({ status: "ok", db: "connected" }, { status: 200 });
});

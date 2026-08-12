import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { ForbiddenError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/generated/prisma/enums";

export type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: string;
};

// GET /api/users — admin-only. Returns every user for the admin "Users" page.
//
// No query params: withApiHandler only calls auth() internally for request
// logging (see lib/api-handler.ts), it doesn't enforce anything, so this
// handler does its own session + role check rather than trusting the
// page-level guard in app/(main)/users/page.tsx — this is a separate entry
// point and must be authoritative on its own.
//
// Deliberately no search/role filtering here — see the comment in
// components/users/users-view.tsx for why that's done client-side instead.
export const GET = withApiHandler(async (_request, _context, log) => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  if (session.user.role !== "ADMIN") throw new ForbiddenError();

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  log.info({ count: users.length }, "fetched user list");
  return NextResponse.json({ users });
});

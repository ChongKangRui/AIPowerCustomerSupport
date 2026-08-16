import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { ConflictError, ForbiddenError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import { createUserSchema } from "@/models/user.model";

// GET /api/users is admin-only. It returns every user for the admin "Users" page. It takes no query params.
//
// withApiHandler resolves the session once and hands it to this handler as the 4th argument (see lib/api-handler.ts). It does not enforce anything itself.
// So this handler still does its own session and role check, instead of trusting the page-level guard in app/(main)/users/page.tsx.
// This is a separate entry point and must be authoritative on its own.
//
// This deliberately has no search or role filtering. See the comment in components/users/users-view.tsx for why that is done client-side instead.
export const GET = withApiHandler(async (_request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();
  if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  log.info({ count: users.length }, "fetched user list");
  return NextResponse.json({ users });
});

// POST /api/users is admin-only. It creates a new user, always with role AGENT.
// See implementation-plan.md. Promoting to Admin is a separate "edit role" action, not part of creation.
//
// This has the same auth check as GET. This route is its own entry point and must be authoritative on its own, independent of the page-level guard in app/(main)/users/page.tsx.
export const POST = withApiHandler(async (request, _context, log, session) => {
  if (!session?.user) throw new UnauthorizedError();
  if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

  const { name, email, password } = createUserSchema.parse(await request.json());

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError("A user with this email already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: Role.AGENT },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  log.info({ userId: user.id }, "created user");
  return NextResponse.json(user, { status: 201 });
});

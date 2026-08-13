import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { ConflictError, ForbiddenError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import { createUserSchema } from "@/models/user.model";

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
  if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  log.info({ count: users.length }, "fetched user list");
  return NextResponse.json({ users });
});

// POST /api/users — admin-only. Creates a new user (always role AGENT — see
// implementation-plan.md; promoting to Admin is a separate "edit role"
// action, not part of creation). Same auth check as GET: this route is its
// own entry point and must be authoritative on its own, independent of the
// page-level guard in app/(main)/users/page.tsx.
export const POST = withApiHandler(async (request, _context, log) => {
  const session = await auth();
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

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  withApiHandler,
} from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import { updateUserSchema } from "@/models/user.model";

// PATCH /api/users/[id] — admin-only. Edits name/email, and password only if
// a non-empty one is provided (see models/user.model.ts's updateUserSchema —
// an empty string means "leave it unchanged"). Role is NOT editable here —
// see implementation-plan.md, that's a separate future action. Same auth
// check as GET/POST in ../route.ts: this route is its own entry point and
// must be authoritative on its own, independent of the page-level guard in
// app/(main)/users/page.tsx.
export const PATCH = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();
    if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

    const { id } = await context.params;
    const { name, email, password } = updateUserSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("User not found");

    // Excludes this user's own row, so saving with an unchanged email never
    // falsely 409s against itself.
    const emailTaken = await prisma.user.findFirst({ where: { email, NOT: { id } } });
    if (emailTaken) throw new ConflictError("A user with this email already exists");

    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

    const user = await prisma.user.update({
      where: { id },
      data: { name, email, ...(passwordHash ? { passwordHash } : {}) },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    log.info({ userId: user.id, passwordChanged: Boolean(passwordHash) }, "updated user");
    return NextResponse.json(user);
  }
);

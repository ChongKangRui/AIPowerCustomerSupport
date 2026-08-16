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
import { destroyAllUserSessions } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/enums";
import { updateUserSchema } from "@/models/user.model";

// PATCH /api/users/[id] is admin-only.
// It edits name and email, and edits password only if a non-empty one is provided.
// See models/user.model.ts's updateUserSchema, where an empty string means "leave it unchanged".
// role is not editable here. See implementation-plan.md — that is a separate future action.
//
// This has the same auth check as GET/POST in ../route.ts. This route is its own entry point and must be authoritative on its own, independent of the page-level guard in app/(main)/users/page.tsx.
export const PATCH = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();
    if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

    const { id } = await context.params;
    const { name, email, password } = updateUserSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("User not found");

    // This excludes this user's own row, so saving with an unchanged email never falsely returns a 409 error against itself.
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

// DELETE /api/users/[id] is admin-only.
// It soft-deletes: it sets deletedAt rather than removing the row, so historical Ticket and TicketMessage references (assignedTo, author) keep resolving.
// See schema.prisma's User model.
//
// Admins can never be deleted — this returns a 403 error instead.
// This force-invalidates the target's active sessions immediately, instead of waiting for their cookie to expire.
export const DELETE = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (_request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();
    if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

    const { id } = await context.params;

    // "Already deleted" is treated the same as "never existed". Both return a 404 error.
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) throw new NotFoundError("User not found");
    if (target.role === Role.ADMIN) {
      throw new ForbiddenError("Admin users cannot be deleted");
    }

    await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
    await destroyAllUserSessions(id);

    log.info({ userId: id }, "deleted user");
    return new NextResponse(null, { status: 204 });
  }
);

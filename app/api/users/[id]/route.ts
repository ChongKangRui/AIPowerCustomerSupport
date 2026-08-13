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

// DELETE /api/users/[id] — admin-only. Soft-deletes: sets deletedAt rather
// than removing the row, so historical Ticket/TicketMessage references
// (assignedTo/author) keep resolving — see schema.prisma's User model.
// Admins can never be deleted (403). Force-invalidates the target's active
// sessions immediately rather than waiting for their cookie to expire.
export const DELETE = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (_request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();
    if (session.user.role !== Role.ADMIN) throw new ForbiddenError();

    const { id } = await context.params;

    // "Already deleted" is treated the same as "never existed" — both 404.
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

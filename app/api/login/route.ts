import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { createUserSession } from "@/lib/session";
import { loginSchema } from "@/models/auth.model";

// A real bcrypt hash of a value nobody will ever type as a password. Used
// below so a request for an email that doesn't exist still pays the same
// bcrypt.compare cost as one that does — otherwise "no such user" would
// return noticeably faster than "wrong password", letting an attacker
// enumerate valid emails purely by timing the response.
const DUMMY_HASH = bcrypt.hashSync("no-such-user-timing-safety", 10);

// POST /api/login — verifies email + password and starts a database session.
export const POST = withApiHandler(async (request, _context, log) => {
  const { email, password } = loginSchema.parse(await request.json());

  const user = await prisma.user.findUnique({ where: { email } });

  const isValidPassword = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_HASH
  );

  if (!user || !user.passwordHash || !isValidPassword) {
    // Deliberately the same message/status for "no such user" and "wrong
    // password" — never confirm which one it was.
    log.warn({ email }, "login failed");
    throw new UnauthorizedError("Invalid email or password");
  }

  await createUserSession(user.id);

  log.info({ userId: user.id }, "login succeeded");
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
});

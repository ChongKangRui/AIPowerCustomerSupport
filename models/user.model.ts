import { z } from "zod";

import type { Role } from "@/lib/generated/prisma/enums";

// The wire shape of a user as returned by GET /api/users (after
// NextResponse.json() serializes createdAt to an ISO string) — not the raw
// Prisma row. Previously lived in app/api/users/route.ts itself; moved here
// so the several UI files that need it (hooks/use-users.ts,
// hooks/use-create-user.ts, hooks/use-update-user.ts,
// components/users/*) import a plain types module instead of reaching
// into a Route Handler file that also pulls in bcrypt/prisma.
export type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: string;
};

// Request-shape validation for the admin "create user" endpoint
// (app/api/users POST). Same convention as models/auth.model.ts — one
// shared, importable source of truth for both the route handler's
// server-side validation and the create-user dialog's client-side form
// validation (components/users/create-user-dialog.tsx).

export const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// PATCH /api/users/[id] — editing an existing user. name/email work the same
// as creation, but password is optional: the edit form's password field is
// always a controlled string (never undefined), so "leave it unchanged" is
// represented as "" rather than the field being absent — hence a union with
// z.literal("") rather than .optional(). Role is deliberately not part of
// this schema; it isn't editable from this form (see implementation-plan.md).
export const updateUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email().trim().toLowerCase(),
  password: z.union([
    z.string().min(8, "Password must be at least 8 characters"),
    z.literal(""),
  ]),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

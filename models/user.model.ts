import { z } from "zod";

import type { Role } from "@/lib/generated/prisma/enums";

// This is the wire shape of a user from GET /api/users.
// NextResponse.json() turns createdAt into an ISO string. This is not the raw Prisma row.
//
// This type used to live in app/api/users/route.ts.
// Several UI files need it: hooks/use-users.ts, hooks/use-create-user.ts, hooks/use-update-user.ts, and components/users/*.
// It moved here so they can import a plain types module.
// They do not need to import a Route Handler file that also pulls in bcrypt and prisma.
export type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: string;
};

// This checks the request body for the admin "create user" endpoint (app/api/users POST).
// This follows the same convention as models/auth.model.ts.
// It is one shared, importable source of truth for the route handler's server-side check and the create-user dialog's client-side form check (components/users/create-user-dialog.tsx).

export const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// This checks the request body for PATCH /api/users/[id], which edits an existing user.
// name and email work the same as creation. password is optional here.
//
// The edit form's password field is always a controlled string, never undefined.
// So "leave it unchanged" is represented as "", not by leaving the field out.
// That is why this uses a union with z.literal(""), not .optional().
//
// role is not part of this schema. This form cannot edit it (see implementation-plan.md).
export const updateUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email().trim().toLowerCase(),
  password: z.union([
    z.string().min(8, "Password must be at least 8 characters"),
    z.literal(""),
  ]),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

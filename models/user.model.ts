import { z } from "zod";

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

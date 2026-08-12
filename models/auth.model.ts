import { z } from "zod";

// Request-shape validation for the auth endpoints (app/api/login,
// app/api/logout) lives here rather than inline in the route files, so it's
// one shared, importable source of truth if anything else ever needs the
// same shape/type (a login form's client-side validation, a future "invite
// user" admin action reusing the password rules, etc).

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

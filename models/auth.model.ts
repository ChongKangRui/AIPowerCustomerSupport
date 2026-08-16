import { z } from "zod";

// This checks the request body for the auth endpoints: app/api/login and app/api/logout.
// It lives here, not inline in the route files, as one shared, importable source of truth.
// Anything else that needs the same shape or type can reuse it: a login form's client-side check, or a future "invite user" admin action that reuses the password rules.

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

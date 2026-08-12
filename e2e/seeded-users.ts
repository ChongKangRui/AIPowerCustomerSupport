import "dotenv/config";

// The only guaranteed test data in this suite — prisma/seed.ts upserts
// exactly these two users (same SEED_* env vars, same fallback defaults) on
// every e2e run's `prisma migrate reset --force` (see e2e/global-setup.ts).
// There is no "register a new user" flow, so every spec that needs a real
// logged-in user authenticates as one of these two rather than creating its
// own account.
//
// `name` is NOT read from an env var — prisma/seed.ts hardcodes "Agent" and
// "Admin" literally regardless of SEED_*_EMAIL/PASSWORD, so it's hardcoded
// here too rather than invented.

export const AGENT = {
  email: process.env.SEED_AGENT_EMAIL ?? "agent@example.com",
  password: process.env.SEED_AGENT_PASSWORD ?? "agent1234",
  name: "Agent",
};

export const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
  name: "Admin",
};

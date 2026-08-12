import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { safeRedirectTarget } from "@/lib/safe-redirect";

import { LoginForm } from "./login-form";

// A Server Component (not "use client") specifically so this can call auth()
// directly — a real DB lookup via the Prisma adapter, not just "is there a
// cookie". proxy.ts only ever does the cheap cookie-presence check (see its
// own comment on why), which is NOT safe to reuse here: if it redirected
// away from /login purely because a cookie exists, a stale/expired/deleted
// session would trap the user in a redirect loop between "/" and "/login"
// with no way to reach the actual form and log back in.
// Demo-account autofill data for the login form. Built here (server-only)
// from prisma/seed.ts's own SEED_* vars — no NEXT_PUBLIC_ duplicates needed,
// since a Server Component can read plain env vars and just pass the values
// down as props instead of relying on client-side env inlining.
const DEMO_ACCOUNTS = [
  {
    label: "Demo agent",
    email: process.env.SEED_AGENT_EMAIL ?? "agent@example.com",
    password: process.env.SEED_AGENT_PASSWORD ?? "agent1234",
  },
  {
    label: "Demo admin",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
  },
] as const;

export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth();

  if (session?.user) {
    const searchParams = await props.searchParams;
    redirect(safeRedirectTarget(searchParams.callbackUrl));
  }

  return <LoginForm demoAccounts={DEMO_ACCOUNTS} />;
}

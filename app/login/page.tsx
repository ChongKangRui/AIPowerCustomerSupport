import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { safeRedirectTarget } from "@/lib/safe-redirect";

import { LoginForm } from "./login-form";

// This is the demo-account autofill data for the login form.
// It is built here, server-only, from prisma/seed.ts's own SEED_* vars.
// No NEXT_PUBLIC_ duplicates are needed, since a Server Component can read plain env vars and just pass the values down as props, instead of relying on client-side env inlining.
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

// This is a Server Component, not "use client", specifically so it can call auth() directly.
// That is a real DB lookup through the Prisma adapter, not just "is there a cookie".
//
// proxy.ts only ever does the cheap cookie-presence check (see its own comment on why).
// That is not safe to reuse here. If it redirected away from /login purely because a cookie exists, a stale, expired, or deleted session would trap the user in a redirect loop between "/" and "/login", with no way to reach the actual form and log back in.
export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth();

  if (session?.user) {
    const searchParams = await props.searchParams;
    redirect(safeRedirectTarget(searchParams.callbackUrl));
  }

  return <LoginForm demoAccounts={DEMO_ACCOUNTS} />;
}

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
export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth();

  if (session?.user) {
    const searchParams = await props.searchParams;
    redirect(safeRedirectTarget(searchParams.callbackUrl));
  }

  return <LoginForm />;
}

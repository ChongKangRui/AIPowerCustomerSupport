import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { getSession } from "@/lib/get-session";

// This is the base auth guard for every page under this route group, currently `/` and `/users`.
//
// proxy.ts (Next 16's Middleware) already redirects to /login when there is no session cookie at all.
// That check is cheap, Edge-runtime, and needs no DB hit. See proxy.ts's own comment on why it is deliberately "optimistic".
// This closes what that check structurally cannot: a cookie that is still present but no longer points at a valid Session row.
// One example: an admin revoked it (lib/session.ts's destroyAllUserSessions, used by DELETE /api/users/[id]). It may also simply have expired.
//
// Without this, a page could silently render its logged-out-looking fallback UI instead of actually leaving the page.
// See git history and implementation-plan.md — this used to be app/(main)/page.tsx's exact bug.
//
// This has no callbackUrl, unlike proxy.ts's own redirect.
// This is a narrow safety net for an edge case — a revoked or expired session — not the primary "come back to what you were doing" UX path, which proxy.ts already owns for the far more common "never logged in" case.
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <Navbar />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}

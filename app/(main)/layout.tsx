import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { getSession } from "@/lib/get-session";

// Base auth guard for every page under this route group (currently `/` and
// `/users`). proxy.ts (Next 16's Middleware) already redirects to /login
// when there's no session cookie at all — cheap, Edge-runtime, no DB hit
// (see proxy.ts's own comment on why it's deliberately "optimistic"). This
// closes what that check structurally can't: a cookie that's still present
// but no longer points at a valid Session row — revoked by an admin (see
// lib/session.ts's destroyAllUserSessions, used by DELETE /api/users/[id])
// or simply expired. Without this, a page could silently render its
// logged-out-looking fallback UI instead of actually leaving the page (see
// git history / implementation-plan.md — this used to be app/(main)/page.tsx's
// exact bug).
//
// No callbackUrl here, unlike proxy.ts's own redirect — this is a narrow
// safety net for an edge case (revoked/expired session), not the primary
// "come back to what you were doing" UX path, which proxy.ts already owns
// for the far more common "never logged in" case.
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

import { redirect } from "next/navigation";

import { UsersView } from "@/components/users/users-view";
import { getSession } from "@/lib/get-session";
import { Role } from "@/lib/generated/prisma/enums";

// Admin-only page. app/(main)/layout.tsx already guarantees a valid,
// logged-in session before this ever renders (redirecting to /login
// otherwise) — this only needs its own additional role check on top, same
// pattern as app/login/page.tsx's session redirect. getSession() (not
// auth() directly) so this and the layout's own check share one auth()
// call per request instead of two — see lib/get-session.ts.
export default async function UsersPage() {
  const session = await getSession();

  if (session?.user?.role !== Role.ADMIN) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <UsersView />
    </div>
  );
}

import { redirect } from "next/navigation";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getSession } from "@/lib/get-session";
import { Role } from "@/lib/generated/prisma/enums";

// This is an admin-only page, the same pattern as app/(main)/users/page.tsx.
// app/(main)/layout.tsx already guarantees a valid, logged-in session before this ever renders — it redirects to /login otherwise.
// So this only needs its own additional role check on top.
//
// This uses getSession(), not auth() directly, so this and the layout's own check share one auth() call per request instead of two. See lib/get-session.ts.
export default async function DashboardPage() {
  const session = await getSession();

  if (session?.user?.role !== Role.ADMIN) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <DashboardView />
    </div>
  );
}

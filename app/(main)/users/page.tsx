import { redirect } from "next/navigation";

import { auth } from "@/auth";

// Admin-only page. proxy.ts only gates on cookie presence (see its own
// comment on why), so the real, DB-verified role check has to happen here —
// same pattern as app/login/page.tsx's session redirect.
export default async function UsersPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">Users</h1>
    </div>
  );
}

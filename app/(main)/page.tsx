"use client";

import { useCurrentUser } from "@/hooks/use-current-user";

export default function HomePage() {
  const { user, isLoading } = useCurrentUser();

  // proxy.ts already guarantees a session cookie exists before this page is
  // reachable, so `user` is only null here while the session query is still
  // in flight (a real "logged out" render would never get past the proxy
  // redirect) — don't flash the logged-out-looking "Welcome" copy for that.
  // The `user` null fallback after loading covers the one edge case proxy.ts
  // *can't* rule out: a cookie that's present but points at an
  // already-expired/deleted Session row.
  const heading =
    !isLoading && user ? `Welcome back, ${user.name ?? user.email}` : "Welcome";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">{heading}</h1>
    </div>
  );
}

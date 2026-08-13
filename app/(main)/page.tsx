"use client";

import { useCurrentUser } from "@/hooks/use-current-user";

export default function HomePage() {
  const { user, isLoading } = useCurrentUser();

  // app/(main)/layout.tsx's own auth() check now guarantees a genuinely
  // valid session before this page is ever reachable (proxy.ts's cheap
  // cookie-presence check alone couldn't rule out a cookie surviving its
  // Session row's deletion — see that layout's comment), so `user` is only
  // null here while the session query is still in flight — don't flash the
  // logged-out-looking "Welcome" copy for that.
  const heading =
    !isLoading && user ? `Welcome back, ${user.name ?? user.email}` : "Welcome";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">{heading}</h1>
    </div>
  );
}

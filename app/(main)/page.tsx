"use client";

import { useCurrentUser } from "@/hooks/use-current-user";

export default function HomePage() {
  const { user } = useCurrentUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">
        {user ? `Welcome back, ${user.name ?? user.email}` : "Welcome"}
      </h1>
    </div>
  );
}

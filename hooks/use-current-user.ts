"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Role } from "@/lib/generated/prisma/enums";

// This type is not exported. No other file imports it by name.
// Every consumer — use-update-user.ts, login-form.tsx, navbar.tsx, and others — just destructures `user` from useCurrentUser()'s return value.
// TypeScript infers the shape from there.
type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
};

type SessionResponse = {
  user: CurrentUser;
  expires: string;
} | null;

// This is a client-side "who is logged in" hook.
// It reads NextAuth's own GET /api/auth/session endpoint through TanStack Query.
// See auth.ts's session() callback for exactly which fields it returns.
// The navbar and pages can react to login and logout this way, without a full page reload.
//
// The login and logout mutations invalidate the "session" query key. That forces a refetch.
export function useCurrentUser() {
  const { data, isLoading } = useQuery({
    queryKey: ["session"],
    // This forwards TanStack Query's own AbortSignal to axios.
    // Without it, a stale in-flight request cannot be cancelled at the network layer.
    // One example: the automatic on-mount fetch this hook kicks off on /login, sent before the user submits the form.
    // When invalidateQueries() triggers a fresh refetch after login, the old request needs to actually stop.
    //
    // Otherwise the old axios call keeps running.
    // If it resolves after the new one — a real risk the first time this route needs a cold dev-mode compile — its pre-login "not logged in" answer silently overwrites the correct post-login session data in the cache.
    queryFn: ({ signal }) =>
      apiClient.get<SessionResponse>("/api/auth/session", { signal }).then((res) => res.data),
  });

  return {
    user: data?.user ?? null,
    isLoading,
  };
}

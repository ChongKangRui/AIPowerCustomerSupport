"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Role } from "@/lib/generated/prisma/enums";

export type CurrentUser = {
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

// Client-side "who's logged in" hook — reads NextAuth's own GET
// /api/auth/session endpoint (see auth.ts's session() callback for exactly
// what fields it returns) through TanStack Query, so the navbar/pages can
// react to login/logout without a full page reload. The query key "session"
// is invalidated by the login and logout mutations to force a refetch.
export function useCurrentUser() {
  const { data, isLoading } = useQuery({
    queryKey: ["session"],
    // Forward TanStack Query's own AbortSignal to axios. Without this, a
    // stale in-flight request (e.g. the automatic on-mount fetch this hook
    // kicks off on /login, sent *before* the user submits the form) can't
    // actually be cancelled at the network layer when invalidateQueries()
    // triggers a fresh refetch after login — the old axios call just keeps
    // running, and if it happens to resolve *after* the new one (a real
    // risk the first time this route needs a cold dev-mode compile), its
    // pre-login "not logged in" answer silently overwrites the correct
    // post-login session data in the cache.
    queryFn: ({ signal }) =>
      apiClient.get<SessionResponse>("/api/auth/session", { signal }).then((res) => res.data),
  }
  
);

  return {
    user: data?.user ?? null,
    isLoading,
  };
}

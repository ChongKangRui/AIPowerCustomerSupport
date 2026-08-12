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
    queryFn: () => apiClient.get<SessionResponse>("/api/auth/session").then((res) => res.data),
  });

  return {
    user: data?.user ?? null,
    isLoading,
  };
}

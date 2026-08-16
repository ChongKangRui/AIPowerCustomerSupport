"use client";

import { useEffect } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiClient } from "@/lib/api-client";
import { Role } from "@/lib/generated/prisma/enums";

function initialsFor(name: string | null, email: string | null) {
  const source = name ?? email ?? "?";
  return source.trim().charAt(0).toUpperCase();
}

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, isLoading } = useCurrentUser();

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.post("/api/logout"),
    onSuccess: async () => {
      // This has no queryKey filter, so it invalidates every cached query — tickets, users, session, and more — not just ["session"].
      //
      // Refetching only session would leave every other query's last-known data sitting in the cache marked fresh.
      // If the next person to use this browser logs in as someone else, any component that reads one of those queries before it happens to refetch on its own would render the previous user's data for an instant.
      // Invalidating everything here means the next mount or access of any query always goes back to the network.
      await queryClient.invalidateQueries();
      // This uses replace, not push, mirroring app/login/login-form.tsx's own use of replace for the opposite direction.
      // It overwrites the just-left protected page's history entry with /login instead of adding to it.
      // So pressing Back from /login cannot land the user right back on a page that now requires a session they no longer have.
      //
      // This has no callbackUrl, unlike the effect below.
      // After a deliberate logout, landing on a bare /login is the expected, already e2e-tested behavior. See e2e/logout.spec.ts.
      router.replace("/login");
    },
  });

  // This closes two gaps, mirroring the pair of effects app/login/login-form.tsx already uses for the opposite direction: redirecting away from /login once logged in.
  //
  // Gap 1: the session went stale while this page was just sitting open.
  // An admin may have revoked it (lib/session.ts's destroyAllUserSessions), it may have expired, or the user may have logged out from another tab.
  // useCurrentUser() (hooks/use-current-user.ts) refetches on window refocus by default, so `user` eventually flips to null here with no navigation at all.
  // This redirects the instant that happens, instead of leaving stale or sensitive content on screen.
  // Navbar is mounted on every page under app/(main)/layout.tsx, so this covers all of them from one place.
  //
  // `!logoutMutation.isSuccess` guards against racing the mutation's own onSuccess above.
  // Invalidating ["session"] there also flips `user` to null, which would otherwise fire this effect too.
  // isSuccess stays true for the rest of this component's lifetime once a deliberate logout completes.
  // So this reliably defers to that handler's own plain, no-callbackUrl redirect, instead of racing it with a second, callbackUrl-bearing one.
  useEffect(() => {
    if (!isLoading && !user && !logoutMutation.isSuccess) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, pathname, router, logoutMutation.isSuccess]);

  // Gap 2: a true browser back/forward cache (bfcache) restore.
  // The whole document — including this component's JS state — was frozen, not re-run, so effect #1 above would not fire on its own.
  // router.refresh() forces a real request, which re-runs app/(main)/layout.tsx's server-side auth() check against the current session.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        router.refresh();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold">
          AI Customer Support
        </Link>

        {user && (
          <Link
            href="/tickets"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Tickets
          </Link>
        )}

        {user?.role === Role.ADMIN && (
          <Link
            href="/users"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Users
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isLoading ? null : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-muted"
              >
                <Avatar size="sm">
                  <AvatarFallback>{initialsFor(user.name, user.email)}</AvatarFallback>
                </Avatar>
                <span>{user.name ?? user.email}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{user.name ?? "Unnamed user"}</span>
                  {user.email && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending ? "Logging out…" : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}

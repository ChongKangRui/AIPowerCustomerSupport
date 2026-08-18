"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ControlledField } from "@/components/ui/controlled-field";
import { FieldGroup } from "@/components/ui/field";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiClient } from "@/lib/api-client";
import { safeRedirectTarget } from "@/lib/safe-redirect";
import { loginSchema, type LoginInput } from "@/models/auth.model";

type DemoAccount = {
  label: string;
  email: string;
  password: string;
};

// This is the demo-account autofill.
// app/login/page.tsx passes the values down — a Server Component that reads prisma/seed.ts's SEED_* vars directly.
// So the buttons always match what was seeded, with no NEXT_PUBLIC_ copies needed.
export function LoginForm({ demoAccounts }: { demoAccounts: readonly DemoAccount[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: (values: LoginInput) => apiClient.post("/api/login", values),
    onSuccess: async () => {
      // This cancels first, then invalidates.
      //
      // This component's own useCurrentUser() call below fires a "session" fetch the instant LoginForm mounts, before the user has even submitted the form.
      // If that fetch is still in flight when login succeeds — for example, the dev server has not compiled /api/auth/session yet, and it takes about 700ms — invalidateQueries alone will not start a genuinely new request.
      // It piggybacks on the one already in flight, which was sent with the pre-login cookie and so resolves to "not logged in".
      // That would silently overwrite the correct post-login session in the cache.
      //
      // cancelQueries aborts that stale request, through the AbortSignal use-current-user.ts now forwards to axios.
      // So the invalidate below is guaranteed to issue a fresh one.
      await queryClient.cancelQueries({ queryKey: ["session"] });
      // This refetches "who is logged in" before navigating, so the navbar on the destination page already has the right name instead of a stale "logged out" flash.
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      // This uses replace, not push. It overwrites /login's own history entry with the destination, instead of adding a new one, so /login is no longer a reachable Back target at all.
      // See the useCurrentUser effect below for why that alone still is not the full fix.
      //
      // This explicit call is load-bearing, not just belt-and-suspenders alongside that effect.
      // Relying solely on the effect — dropping this line and letting the invalidated query's refetch flip `user` truthy — was tried.
      // It was measurably flaky under e2e load: the effect's redirect did not fire reliably right after a fresh submit.
      //
      // Both stay. This one covers "just logged in." The effect covers the back-button and Router-Cache-remount cases, where this onSuccess never runs at all.
      router.replace(safeRedirectTarget(searchParams.get("callbackUrl")));
    },
  });

  function onSubmit(values: LoginInput) {
    loginMutation.mutate(values);
  }

  function fillDemoAccount(account: DemoAccount) {
    form.setValue("email", account.email, { shouldValidate: true });
    form.setValue("password", account.password, { shouldValidate: true });
  }

  // There are two different "already logged in, do not show me the login form again" gaps, and each needs its own fix.
  // app/login/page.tsx's server-side auth() redirect only covers a genuinely fresh request: typing the URL, or a hard reload.
  //
  // Gap 1: a true browser back/forward cache (bfcache) restore.
  // The whole document was unloaded and later restored — for example, leaving the tab or site and coming back.
  // That freezes the JS heap as-is and does not re-run mount effects, so nothing below would fire on its own.
  //
  // `pageshow`'s `persisted` flag is the browser's own signal that this happened.
  // router.refresh() forces a real request. Since this page uses auth(), a dynamic API, that request always re-runs the redirect check against the current session.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        router.refresh();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  // Gap 2: Next's own client-side Router Cache.
  // Pressing Back after a client-side navigation causes no document unload at all, so bfcache and `pageshow` never enter the picture.
  // It can instead swap this exact component back in from a render Next cached moments ago, as a genuine remount.
  //
  // This reuses useCurrentUser() here, the same TanStack Query-backed session hook the navbar already uses.
  // So this effect reads session state that is very likely already warm in the shared QueryClient cache, populated right after login.
  // It can then redirect away almost immediately on remount, instead of waiting on a fresh network round trip.
  useEffect(() => {
    if (user) {
      router.replace(safeRedirectTarget(searchParams.get("callbackUrl")));
    }
  }, [user, router, searchParams]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="w-full max-w-sm"
        noValidate
      >
        <FieldGroup>
          <div className="flex flex-col gap-1 text-center">
            <h1 className="text-xl font-semibold">Log in</h1>
            <p className="text-sm text-muted-foreground">
              Enter your email and password to continue.
            </p>
          </div>

          <ControlledField
            name="email"
            control={form.control}
            label="Email"
            inputProps={{ type: "email", autoComplete: "email", placeholder: "you@example.com" }}
          />

          <ControlledField
            name="password"
            control={form.control}
            label="Password"
            inputProps={{ type: "password", autoComplete: "current-password" }}
          />

          {loginMutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {loginMutation.error.message}
            </p>
          )}

          <Button type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Logging in…" : "Log in"}
          </Button>

         
          <div className="flex gap-2">
            {demoAccounts.map((account) => (
              <Button
                key={account.label}
                type="button"
              
                className="flex-1"
                disabled={loginMutation.isPending}
                onClick={() => fillDemoAccount(account)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}

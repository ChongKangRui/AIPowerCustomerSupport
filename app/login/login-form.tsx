"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiClient } from "@/lib/api-client";
import { safeRedirectTarget } from "@/lib/safe-redirect";
import { loginSchema, type LoginInput } from "@/models/auth.model";

type DemoAccount = {
  label: string;
  email: string;
  password: string;
};

// Demo-account autofill. Values are passed down from app/login/page.tsx (a
// Server Component reading prisma/seed.ts's SEED_* vars directly) so the
// buttons always match what was seeded, with no NEXT_PUBLIC_ copies needed.
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
      // Refetch "who's logged in" before navigating, so the navbar on the
      // destination page already has the right name instead of a stale
      // "logged out" flash.
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      // replace, not push: this overwrites /login's own history entry with
      // the destination instead of adding a new one, so /login is no longer
      // a reachable Back target at all — see the useCurrentUser effect below
      // for why that alone still isn't the full fix.
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

  // Two different "already logged in, don't show me the login form again"
  // gaps, each needing its own fix — app/login/page.tsx's server-side
  // auth() redirect only covers a genuinely fresh request (typing the URL,
  // a hard reload):
  //
  // 1. True browser back/forward cache (bfcache) — the whole document was
  //    unloaded and later restored (e.g. leaving the tab/site and coming
  //    back), which freezes the JS heap as-is and does NOT re-run mount
  //    effects, so nothing below would fire on its own. `pageshow`'s
  //    `persisted` flag is the browser's own signal that this happened;
  //    router.refresh() forces a real request, and since this page uses
  //    auth() (a dynamic API) that request always re-runs the redirect
  //    check against the current session.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        router.refresh();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  // 2. Next's own client-side Router Cache — pressing Back after a
  //    client-side navigation (no document unload at all, so bfcache/
  //    `pageshow` never enters the picture) can swap this exact component
  //    back in from a render Next cached moments ago, as a genuine remount.
  //    Reusing useCurrentUser() here — the same TanStack Query-backed
  //    session hook the navbar already uses — means this effect reads
  //    session state that's very likely already warm in the shared
  //    QueryClient cache (populated right after login), so it can redirect
  //    away almost immediately on remount rather than waiting on a fresh
  //    network round trip.
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

          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="email"
                  autoComplete="email"
                  aria-invalid={fieldState.invalid}
                  placeholder="you@example.com"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
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

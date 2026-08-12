"use client";

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
      router.push(safeRedirectTarget(searchParams.get("callbackUrl")));
    },
  });

  function onSubmit(values: LoginInput) {
    loginMutation.mutate(values);
  }

  function fillDemoAccount(account: DemoAccount) {
    form.setValue("email", account.email, { shouldValidate: true });
    form.setValue("password", account.password, { shouldValidate: true });
  }

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

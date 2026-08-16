import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginForm } from "@/app/login/login-form";

// apiClient is mocked for the same reason as
// components/users/user-form-dialog.test.tsx. LoginForm's own
// useCurrentUser() call fires a GET the instant it mounts (see that
// hook's comment for why). None of the tests below exercise a real
// submit, so there is no real network to hit in jsdom anyway.
const apiClientMocks = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: null })),
  post: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: apiClientMocks }));

// LoginForm reads useRouter and useSearchParams. Both need a real
// Next.js App Router tree to work outside of one. This mocks them
// instead of wrapping the test in a real router, since none of the
// tests below navigate. They only check client-side form and
// validation state.
const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const demoAccounts = [
  { label: "Demo agent", email: "agent@example.com", password: "agent-password" },
  { label: "Demo admin", email: "admin@example.com", password: "admin-password" },
];

// This covers only LoginForm's client-side mechanics: react-hook-form
// with zodResolver(loginSchema) blocking an invalid submit, and the
// demo-account buttons' plain form-fill behavior.
//
// This is the component-test half of what used to run only as an e2e
// round trip through a real dev server (e2e/login.spec.ts's
// "client-side validation" and "demo account buttons" describe blocks).
// loginSchema's own validation rules already have dedicated unit
// coverage in models/auth.model.test.ts. What is left to prove here is
// just that this component wires up to it and renders the resulting
// error.
//
// The actual login round trip stays in e2e/login.spec.ts: successful
// auth, the generic invalid-credentials error for a wrong password
// versus a nonexistent user, and the demo-button-then-submit flow. All
// of those need a real backend. See that file's own comment.
function renderLoginForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginForm demoAccounts={demoAccounts} />
    </QueryClientProvider>
  );
}

describe("client-side validation", () => {
  it("shows an inline error and never submits when email is empty", async () => {
    renderLoginForm();

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "whatever123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(apiClientMocks.post).not.toHaveBeenCalled();
  });

  it("shows an inline error and never submits when password is empty", async () => {
    renderLoginForm();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(apiClientMocks.post).not.toHaveBeenCalled();
  });

  it("shows an inline error and never submits for a malformed email", async () => {
    renderLoginForm();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "whatever123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(apiClientMocks.post).not.toHaveBeenCalled();
  });
});

describe("demo account buttons", () => {
  it("autofill the matching seeded credentials without submitting", () => {
    renderLoginForm();

    fireEvent.click(screen.getByRole("button", { name: "Demo agent" }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      demoAccounts[0].email
    );
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe(
      demoAccounts[0].password
    );
    expect(apiClientMocks.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Demo admin" }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      demoAccounts[1].email
    );
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe(
      demoAccounts[1].password
    );
    expect(apiClientMocks.post).not.toHaveBeenCalled();
  });
});

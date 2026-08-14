import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Role } from "@/lib/generated/prisma/enums";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import type { UserListItem } from "@/models/user.model";

// apiClient is mocked at the module boundary rather than left to hit a real
// network: useUpdateUser() (pulled in unconditionally by UserFormDialog, see
// that component's comment on why both mutations are always called) chains
// off useCurrentUser(), which fires a GET on mount — with no mock, jsdom has
// no server to answer it and TanStack Query's default retry/backoff would
// make every test in this file slow and its "was the API ever called"
// assertions unreliable. get() below resolves to "no session", closest to
// this dialog's real standalone usage in a test.
const apiClientMocks = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: null })),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: apiClientMocks }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Coverage for UserFormDialog's client-side form mechanics — react-hook-form
// wired to models/user.model.ts's zod schemas via zodResolver — in isolation
// from the network/DB. This is the component-test half of what used to run
// only as an e2e round trip through a real login + dev server + Postgres
// (e2e/admin-create-user.spec.ts's "shows inline validation errors" test,
// e2e/admin-edit-user.spec.ts's pre-fill assertions). The success/
// duplicate-email/blank-password-really-unchanged paths still need a real
// backend to mean anything and stay in those e2e files — see their own
// top-of-file comments for why.
function renderDialog(user?: UserListItem) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <UserFormDialog
        open
        onOpenChange={onOpenChange}
        user={user}
        trigger={<button>trigger</button>}
      />
    </QueryClientProvider>
  );
  return { onOpenChange };
}

describe("UserFormDialog — create mode", () => {
  it("shows inline validation errors for invalid input and never calls the create API", async () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "New user" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "ab" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(within(dialog).getByLabelText("Password"), {
      target: { value: "short1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

    expect(await within(dialog).findByText("Name must be at least 3 characters")).toBeTruthy();
    // zod's built-in message for z.email() — models/user.model.ts doesn't
    // override it (only name/password get custom messages there).
    expect(within(dialog).getByText("Invalid email address")).toBeTruthy();
    expect(within(dialog).getByText("Password must be at least 8 characters")).toBeTruthy();

    // Client-side validation blocked the submit entirely — no request ever
    // reached apiClient, and the entered values are still there (not reset).
    expect(apiClientMocks.post).not.toHaveBeenCalled();
    expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("ab");
  });
});

describe("UserFormDialog — edit mode", () => {
  const user: UserListItem = {
    id: "user-1",
    name: "Edit Test Original Name",
    email: "original@example.com",
    role: Role.AGENT,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("opens pre-filled with the row's current name/email and an empty password field", () => {
    renderDialog(user);

    const dialog = screen.getByRole("dialog", { name: "Edit user" });
    expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe(user.name);
    expect((within(dialog).getByLabelText("Email") as HTMLInputElement).value).toBe(user.email);
    expect((within(dialog).getByLabelText("New password") as HTMLInputElement).value).toBe("");
  });

  it("shows the same name/password validation errors as create mode", async () => {
    renderDialog(user);

    const dialog = screen.getByRole("dialog", { name: "Edit user" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "ab" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await within(dialog).findByText("Name must be at least 3 characters")).toBeTruthy();
    expect(apiClientMocks.patch).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Role } from "@/lib/generated/prisma/enums";
import { UsersView } from "@/components/users/users-view";
import type { UserListItem } from "@/models/user.model";

const admin: UserListItem = {
  id: "1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: Role.ADMIN,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const agent: UserListItem = {
  id: "2",
  name: "Grace Hopper",
  email: "grace@example.com",
  role: Role.AGENT,
  createdAt: "2026-01-02T00:00:00.000Z",
};

// Routes the shared apiClient mock by URL. UsersView pulls in both
// useUsers() (GET /api/users) and useCurrentUser() (GET
// /api/auth/session), the latter through the nested CreateUserDialog,
// UserFormDialog, and useCreateUser/useUpdateUser.
//
// This mocks apiClient for the same reason
// components/users/user-form-dialog.test.tsx does, instead of hitting a
// real network from jsdom.
const apiClientMocks = vi.hoisted(() => ({
  get: vi.fn((url: string) => {
    if (url === "/api/users") return Promise.resolve({ data: { users: [admin, agent] } });
    return Promise.resolve({ data: null });
  }),
  post: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: apiClientMocks }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// This covers the search and role-filter wiring in UsersView: that
// typing into the search input and picking a role really does narrow
// the rendered UsersTable.
//
// This is the component-test half of what used to run only as an e2e
// round trip through a real login, dev server, and seeded Postgres rows
// (e2e/users.spec.ts's "searching by a unique email…" and "filtering by
// role…" tests). The actual filter logic — case-insensitivity, AND
// versus OR, null-name handling, and more — already has its own
// exhaustive unit coverage in components/users/filter-users.test.ts.
// This file proves only that the component calls it with the right
// inputs and re-renders.
//
// Access control and the live-listing-of-real-seeded-users assertions
// stay in e2e/users.spec.ts. Those need a real authenticated session
// and DB. See that file's own comment.
function renderUsersView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersView />
    </QueryClientProvider>
  );
}

describe("UsersView", () => {
  it("lists every fetched user once loaded", async () => {
    renderUsersView();

    expect(await screen.findByText(admin.email)).toBeTruthy();
    expect(screen.getByText(agent.email)).toBeTruthy();
  });

  it("narrows the list to a search match, and restores it when cleared", async () => {
    renderUsersView();
    await screen.findByText(agent.email);

    fireEvent.change(screen.getByLabelText("Search users"), {
      target: { value: agent.email },
    });
    await waitFor(() => expect(screen.queryByText(admin.email)).toBeNull());
    expect(screen.getByText(agent.email)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByText(admin.email)).toBeTruthy());
    expect(screen.getByText(agent.email)).toBeTruthy();
  });

  it("narrows the list to the selected role", async () => {
    renderUsersView();
    await screen.findByText(agent.email);

    fireEvent.change(screen.getByLabelText("Filter by role"), {
      target: { value: Role.ADMIN },
    });
    await waitFor(() => expect(screen.queryByText(agent.email)).toBeNull());
    expect(screen.getByText(admin.email)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter by role"), { target: { value: "ALL" } });
    await waitFor(() => expect(screen.getByText(agent.email)).toBeTruthy());
  });

  it("shows a 'no users match' message when search and role together match nothing", async () => {
    renderUsersView();
    await screen.findByText(agent.email);

    fireEvent.change(screen.getByLabelText("Search users"), {
      target: { value: "nobody-matches-this" },
    });

    expect(await screen.findByText("No users match your filters.")).toBeTruthy();
  });
});

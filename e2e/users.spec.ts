import { expect, test } from "@playwright/test";

import { Role } from "@/lib/generated/prisma/enums";
import { ADMIN, AGENT } from "./seeded-users";
import { ADMIN_STORAGE_STATE, AGENT_STORAGE_STATE } from "./storage-state";

// Coverage for the admin-only "Users" feature: app/(main)/users/page.tsx,
// components/users/users-view.tsx + users-table.tsx, hooks/use-users.ts,
// and GET/POST /api/users (app/api/users/route.ts).
//
// Everything in *this file* is read-only — listing and access control,
// including POST /api/users' access control, which is exercised here
// rather than duplicated elsewhere. So nothing here writes rows another
// parallel test could race on, and every test loads a shared storageState
// snapshot (e2e/auth.setup.ts) rather than logging in through the UI. The
// "New user" dialog's actual create flow (validation, success,
// duplicate-email) does write rows and lives in its own file,
// e2e/admin-create-user.spec.ts, with its own isolation notes.
//
// The search/role-filter tests that used to live here — typing an email
// into "Search users" narrowing the table, picking a role from "Filter by
// role" — have moved to components/users/users-view.test.tsx, which
// covers the same wiring against an in-memory fixture list instead of
// real seeded/authenticated DB rows. The underlying filter *logic* itself
// (case-insensitivity, combining search + role, null-name handling)
// already has its own exhaustive unit coverage in
// components/users/filter-users.test.ts. What stays here — "sees the
// seeded admin and agent among the listed users" — is the one test that
// still needs a real GET /api/users round trip against actual seeded,
// authenticated data to mean anything.
//
// The page-level admin-vs-agent redirect is also spot-checked (more
// briefly) in e2e/session-redirect.spec.ts alongside the rest of that
// file's proxy.ts/callbackUrl coverage. The "access control" describe
// below is the canonical, feature-scoped version of that same check plus
// the proxy.ts-level unauthenticated redirect, which nothing else
// asserts specifically for /users.

test.describe("admin viewing the users list", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("sees the seeded admin and agent among the listed users", async ({ page }) => {
    await page.goto("/users");

    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("cell", { name: ADMIN.email, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: AGENT.email, exact: true })).toBeVisible();
  });

});

test.describe("access control", () => {
  test("an unauthenticated visitor is redirected to /login with a callbackUrl back to /users", async ({
    page,
  }) => {
    // No storageState loaded for this test — proxy.ts's cookie-presence
    // check, not the page's own admin check, is what fires here.
    await page.goto("/users");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe("/users");
  });

  test.describe("as an authenticated agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("is redirected home instead of seeing the admin-only page", async ({ page }) => {
      // Past proxy.ts (a session cookie is present) — this is
      // app/(main)/users/page.tsx's own DB-verified role check.
      await page.goto("/users");

      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
    });
  });
});

test.describe("GET /api/users", () => {
  test("returns 401 with no session", async ({ request }) => {
    const response = await request.get("/api/users");
    expect(response.status()).toBe(401);
  });

  test.describe("as an authenticated agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("returns 403 — agents aren't admins", async ({ request }) => {
      const response = await request.get("/api/users");
      expect(response.status()).toBe(403);
    });
  });

  test.describe("as an authenticated admin", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test("returns the full user list, including the seeded admin, in the documented shape", async ({
      request,
    }) => {
      const response = await request.get("/api/users");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.anything(),
            email: ADMIN.email,
            role: Role.ADMIN,
            createdAt: expect.any(String),
          }),
        ])
      );
    });
  });
});

test.describe("POST /api/users", () => {
  // Access control only — same "own entry point, must be authoritative on
  // its own" auth check as GET (app/api/users/route.ts).
  //
  // The success/validation/conflict paths for an authorized admin are
  // covered through the real "New user" UI in
  // e2e/admin-create-user.spec.ts, not repeated here as a raw API call,
  // so this never itself creates a row.
  const body = {
    name: "Should Not Be Created",
    email: "unauthorized-attempt@example.com",
    password: "whatever123",
  };

  test("returns 401 with no session", async ({ request }) => {
    const response = await request.post("/api/users", { data: body });
    expect(response.status()).toBe(401);
  });

  test.describe("as an authenticated agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("returns 403 — agents can't create users", async ({ request }) => {
      const response = await request.post("/api/users", { data: body });
      expect(response.status()).toBe(403);
    });
  });
});

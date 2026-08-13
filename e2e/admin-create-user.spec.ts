import { expect, test } from "@playwright/test";

import { ADMIN } from "./seeded-users";
import { ADMIN_STORAGE_STATE } from "./storage-state";

// Coverage for the admin "create user" flow: the "New user" modal
// (components/users/create-user-dialog.tsx, rendered on /users via
// components/users/users-view.tsx), hooks/use-create-user.ts, and
// POST /api/users (app/api/users/route.ts). Read-only listing/search/filter
// coverage and page-level admin-vs-agent access control for /users itself
// live in e2e/users.spec.ts, which also covers POST /api/users'
// unauthenticated/non-admin access control — this file is scoped to the
// happy/validation/conflict paths of the dialog itself.
//
// Every test loads the shared ADMIN storageState snapshot (e2e/auth.setup.ts)
// rather than driving a UI login — the login flow itself is covered by
// e2e/login.spec.ts.
//
// Shared-state isolation: fullyParallel workers share one test DB that's
// reset only once for the whole suite run (e2e/global-setup.ts), so the test
// that actually creates a row gives it an email unique to that test run
// (test.info().testId) — same pattern e2e/login.spec.ts already uses for its
// nonexistent-user case — rather than a fixed literal another parallel spec
// could collide with. The duplicate-email test is the one deliberate
// exception: it targets the seeded admin's own email, which no other spec
// deletes or renames, so asserting a 409 against it is safe to do
// concurrently from any number of workers.

test.describe("admin creating a user from /users", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("shows inline validation errors for invalid input and never submits", async ({ page }) => {
    let createUserRequestCount = 0;
    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") createUserRequestCount++;
      await route.continue();
    });

    await page.goto("/users");
    await page.getByRole("button", { name: "New user" }).click();

    const dialog = page.getByRole("dialog", { name: "New user" });
    await expect(dialog).toBeVisible();

    // One value per field, all invalid at once — a single submit is enough
    // to prove react-hook-form's zodResolver blocks the request rather than
    // needing three separate submit round trips.
    await dialog.getByLabel("Name").fill("ab");
    await dialog.getByLabel("Email").fill("not-an-email");
    await dialog.getByLabel("Password").fill("short1");
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(dialog.getByText("Name must be at least 3 characters")).toBeVisible();
    // zod's built-in message for z.email() (models/user.model.ts doesn't
    // override it the way it does for name/password) — see that schema.
    await expect(dialog.getByText("Invalid email address")).toBeVisible();
    await expect(dialog.getByText("Password must be at least 8 characters")).toBeVisible();

    // Client-side validation blocked the submit entirely — no request ever
    // reached the server, and the modal is still open with the entered
    // values intact (not reset).
    expect(createUserRequestCount).toBe(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Name")).toHaveValue("ab");
  });

  test("creates a new agent and it appears in the table without a manual reload", async ({
    page,
  }) => {
    const email = `e2e-create-user-${test.info().testId}@example.com`;
    const name = "E2E Created User";

    await page.goto("/users");
    // Wait for the initial fetch to settle before interacting, same reason
    // as e2e/users.spec.ts's search test.
    await expect(page.getByRole("cell", { name: ADMIN.email, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "New user" }).click();
    const dialog = page.getByRole("dialog", { name: "New user" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Password").fill("supersecret123");
    await dialog.getByRole("button", { name: "Create user" }).click();

    // Modal closes on success (no manual dismiss).
    await expect(dialog).toBeHidden();

    // New row shows up without a manual reload — driven by the ["users"]
    // query invalidation in hooks/use-create-user.ts, not a page refresh.
    const row = page.getByRole("row", { name: new RegExp(email) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name, exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: email, exact: true })).toBeVisible();
    await expect(row.getByText("AGENT", { exact: true })).toBeVisible();
  });

  test("shows the server's 409 error for a duplicate email and keeps the modal open", async ({
    page,
  }) => {
    await page.goto("/users");
    await page.getByRole("button", { name: "New user" }).click();

    const dialog = page.getByRole("dialog", { name: "New user" });
    await dialog.getByLabel("Name").fill("Duplicate Attempt");
    // Targets the seeded admin's email on purpose — see the isolation note
    // at the top of this file.
    await dialog.getByLabel("Email").fill(ADMIN.email);
    await dialog.getByLabel("Password").fill("supersecret123");
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(dialog.getByRole("alert")).toHaveText("A user with this email already exists");
    await expect(dialog).toBeVisible();
  });
});

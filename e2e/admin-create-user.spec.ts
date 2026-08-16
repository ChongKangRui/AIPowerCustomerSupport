import { expect, test } from "@playwright/test";

import { Role } from "@/lib/generated/prisma/enums";
import { ADMIN } from "./seeded-users";
import { ADMIN_STORAGE_STATE } from "./storage-state";

// Coverage for the admin "create user" flow: the "New user" modal
// (components/users/create-user-dialog.tsx, rendered on /users via
// components/users/users-view.tsx), hooks/use-create-user.ts, and
// POST /api/users (app/api/users/route.ts).
//
// Read-only listing/search/filter coverage and page-level admin-vs-agent
// access control for /users itself live in e2e/users.spec.ts, which also
// covers POST /api/users' unauthenticated/non-admin access control — this
// file is scoped to the happy/validation/conflict paths of the dialog itself.
//
// The client-side validation case — invalid name/email/password blocking
// a submit with zero requests reaching the server — has moved to
// components/users/user-form-dialog.test.tsx's "UserFormDialog — create
// mode" describe block: react-hook-form + zodResolver blocking a bad
// submit doesn't need a real browser, login, or dev server to prove. What
// stays here needs a real POST /api/users round trip: creating a row and
// seeing it land in the table without a manual reload, and the server's
// 409 on a duplicate email.
//
// Every test loads the shared ADMIN storageState snapshot
// (e2e/auth.setup.ts) rather than driving a UI login — the login flow
// itself is covered by e2e/login.spec.ts.
//
// Shared-state isolation: fullyParallel workers share one test DB that's
// reset only once for the whole suite run (e2e/global-setup.ts), so the
// test that actually creates a row gives it an email unique to that test
// run rather than a fixed literal another parallel spec could collide with.
//
// test.info().testId alone is NOT enough for this, despite being the
// pattern e2e/login.spec.ts uses for its nonexistent-user case there:
// testId is a deterministic hash of the file+title, stable across every
// execution of this same test, retries included. A test that creates a
// row via a testId-only email, then fails on a later assertion (e.g.
// dev-server compile latency, see playwright.config.ts's expect.timeout
// comment) and gets retried, or gets manually re-run from --ui without a
// fresh DB reset in between, hits a *real* 409 on attempt 2 against the
// row attempt 1 truly created — hence Date.now() appended too, unique per
// actual attempt, not just per logical test.
//
// The duplicate-email test is the one deliberate exception to needing any
// of this: it targets the seeded admin's own email, which no other spec
// deletes or renames, so asserting a 409 against it is safe, and
// idempotent to rerun, from any number of workers.

test.describe("admin creating a user from /users", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("creates a new agent and it appears in the table without a manual reload", async ({
    page,
  }) => {
    const email = `e2e-create-user-${test.info().testId}-${Date.now()}@example.com`;
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
    await expect(row.getByText(Role.AGENT, { exact: true })).toBeVisible();
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

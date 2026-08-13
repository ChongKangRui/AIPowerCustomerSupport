import { expect, test, type Page } from "@playwright/test";

import { ADMIN } from "./seeded-users";
import { ADMIN_STORAGE_STATE } from "./storage-state";

// Coverage for the admin "delete user" (soft-delete) flow:
// components/users/delete-user-dialog.tsx (rendered per-row in
// components/users/users-table.tsx, next to EditUserDialog), backed by
// hooks/use-delete-user.ts and DELETE /api/users/[id]
// (app/api/users/[id]/route.ts). Read-only listing/access-control coverage
// lives in e2e/users.spec.ts; create/edit flows live in their own sibling
// files — this file is scoped to delete-specific behavior: the confirmation
// dialog (cancel vs confirm), the live-table removal + login lockout that
// prove the soft-delete actually took effect, the "admins can never be
// deleted" guarantee (UI + API), and the permanent-email-uniqueness
// regression (an email is reserved forever once used, even by a
// soft-deleted row — see prisma/schema.prisma's User.email comment).
//
// Every test loads the shared ADMIN storageState snapshot (e2e/auth.setup.ts)
// rather than driving a UI login for the *admin* steps — the login flow
// itself is covered by e2e/login.spec.ts. The login-lockout test does drive a
// real UI login, but only as a black-box way to prove the soft-deleted user's
// credentials stop working server-side (there's no other way to observe that
// from a spec).
//
// Shared-state isolation: fullyParallel workers share one test DB that's
// reset only once for the whole suite run (e2e/global-setup.ts), so every
// test here creates its own throwaway user (via the existing "New user"
// dialog, with an email unique to the attempt — Date.now() appended in
// addition to test.info().testId, same reasoning as
// e2e/admin-create-user.spec.ts's top-of-file comment) and only ever deletes
// that row, never the seeded AGENT fixture other specs rely on. The one
// deliberate exception is the "admins can't be deleted" test, which reads
// (never mutates) the seeded ADMIN's own row/id — safe by construction since
// the feature itself is what's supposed to prevent any mutation, but that
// test still asserts the UI button is disabled *before* ever attempting the
// direct API bypass, and treats anything other than a 403 from that bypass as
// a hard failure, so a hypothetical bug here can't silently delete the shared
// admin and cascade into breaking every other spec.

async function createUserViaUi(
  page: Page,
  { name, email, password }: { name: string; email: string; password: string }
) {
  await page.getByRole("button", { name: "New user" }).click();
  const dialog = page.getByRole("dialog", { name: "New user" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row", { name: new RegExp(email) });
  await expect(row).toBeVisible();
  return row;
}

test.describe("admin deleting a user from /users", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("canceling the confirmation dialog leaves the user intact", async ({ page }) => {
    const email = `e2e-delete-user-cancel-${test.info().testId}-${Date.now()}@example.com`;

    await page.goto("/users");
    const row = await createUserViaUi(page, {
      name: "Delete Test Cancel",
      email,
      password: "supersecret123",
    });

    await row.getByRole("button", { name: `Delete Delete Test Cancel` }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete Delete Test Cancel?" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // Row is still present — nothing was submitted.
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name: email, exact: true })).toBeVisible();
  });

  test("confirming delete removes the row live and the user can no longer log in", async ({
    page,
    browser,
  }) => {
    const email = `e2e-delete-user-confirm-${test.info().testId}-${Date.now()}@example.com`;
    const password = "supersecret123";
    const name = "Delete Test Confirm";

    await page.goto("/users");
    const row = await createUserViaUi(page, { name, email, password });

    await row.getByRole("button", { name: `Delete ${name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: `Delete ${name}?` });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();

    // Row disappears without a manual reload — driven by the ["users"] query
    // invalidation in hooks/use-delete-user.ts, not a page refresh.
    await expect(row).toBeHidden();
    await expect(page.getByRole("cell", { name: email, exact: true })).toHaveCount(0);

    // storageState: undefined is load-bearing here, not a no-op — see the
    // comment on the same line in e2e/admin-edit-user.spec.ts for exactly
    // why omitting it would silently hand loginPage the admin's own session
    // cookie instead of ever rendering the login form.
    const context = await browser.newContext({ storageState: undefined });
    const loginPage = await context.newPage();
    await loginPage.goto("/login");
    await loginPage.getByLabel("Email").fill(email);
    await loginPage.getByLabel("Password").fill(password);
    await loginPage.getByRole("button", { name: "Log in" }).click();

    // Same generic invalid-credentials path as a wrong password or a
    // nonexistent user (app/api/login/route.ts filters deletedAt: null) —
    // see e2e/login.spec.ts's "invalid credentials" describe block.
    await expect(loginPage.locator("form").getByRole("alert")).toHaveText(
      "Invalid email or password"
    );
    await expect(loginPage).toHaveURL(/\/login$/);

    await context.close();
  });

  test("admins can never be deleted — disabled in the UI, and 403s if the API is called directly", async ({
    page,
    request,
  }) => {
    await page.goto("/users");
    const adminRow = page.getByRole("row", { name: new RegExp(ADMIN.email) });
    await expect(adminRow).toBeVisible();

    const deleteButton = adminRow.getByRole("button", {
      name: "Admin users cannot be deleted",
    });
    await expect(deleteButton).toBeDisabled();

    // Force past Playwright's actionability check (which would otherwise
    // refuse to click a disabled element) to prove clicking it truly does
    // nothing, not just that it's visually disabled.
    await deleteButton.click({ force: true });
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // Bypass the UI entirely and confirm the API itself enforces this, not
    // just the disabled button — reusing the storageState-authenticated
    // request context, same pattern as e2e/users.spec.ts's API-level checks.
    const usersResponse = await request.get("/api/users");
    expect(usersResponse.status()).toBe(200);
    const { users } = await usersResponse.json();
    const adminUser = users.find((u: { email: string }) => u.email === ADMIN.email);
    expect(adminUser).toBeDefined();

    const deleteResponse = await request.delete(`/api/users/${adminUser.id}`);
    expect(deleteResponse.status()).toBe(403);
    const body = await deleteResponse.json();
    expect(body.error).toBe("Admin users cannot be deleted");

    // The admin's own row is still there, still not deleted — belt-and-braces
    // beyond the status code check above.
    await page.reload();
    await expect(page.getByRole("cell", { name: ADMIN.email, exact: true })).toBeVisible();
  });

  test("an email used by a deleted user cannot be reused for a new account", async ({ page }) => {
    const email = `e2e-delete-user-reuse-${test.info().testId}-${Date.now()}@example.com`;
    const originalName = "Delete Test Reuse Original";
    const newName = "Delete Test Reuse New";

    await page.goto("/users");
    const originalRow = await createUserViaUi(page, {
      name: originalName,
      email,
      password: "supersecret123",
    });

    await originalRow.getByRole("button", { name: `Delete ${originalName}` }).click();
    const deleteDialog = page.getByRole("alertdialog", { name: `Delete ${originalName}?` });
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(originalRow).toBeHidden();

    // Same exact email, brand-new user — must fail. User.email is @unique in
    // the schema regardless of deletedAt (see prisma/schema.prisma's comment
    // on that field), and app/api/users/route.ts's POST conflict check is a
    // plain findUnique({ where: { email } }) with no deletedAt filter, so
    // this hits the same 409 the duplicate-email tests elsewhere assert on
    // (e.g. e2e/admin-create-user.spec.ts's "shows the server's 409 error for
    // a duplicate email" test) even though the original row is soft-deleted.
    await page.getByRole("button", { name: "New user" }).click();
    const createDialog = page.getByRole("dialog", { name: "New user" });
    await createDialog.getByLabel("Name").fill(newName);
    await createDialog.getByLabel("Email").fill(email);
    await createDialog.getByLabel("Password").fill("supersecret456");
    await createDialog.getByRole("button", { name: "Create user" }).click();

    await expect(createDialog.getByRole("alert")).toHaveText(
      "A user with this email already exists"
    );
    await expect(createDialog).toBeVisible();
  });
});

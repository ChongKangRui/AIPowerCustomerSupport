import { expect, test, type Page } from "@playwright/test";

import { ADMIN } from "./seeded-users";
import { ADMIN_STORAGE_STATE } from "./storage-state";

// Coverage for the admin "edit user" flow: the "Edit user" mode of
// components/users/user-form-dialog.tsx (shared with the "New user" dialog),
// triggered per-row by components/users/edit-user-dialog.tsx, backed by
// hooks/use-update-user.ts and PATCH /api/users/[id]
// (app/api/users/[id]/route.ts). Read-only listing/access-control coverage
// lives in e2e/users.spec.ts; the create-user half of this same shared
// dialog lives in e2e/admin-create-user.spec.ts — this file is scoped to the
// edit-specific behavior: pre-filling, the "blank password = unchanged"
// contract, the duplicate-email 409, and the self-edit ["session"]
// invalidation that refreshes the navbar.
//
// The pure "opens pre-filled with name/email, empty password field" render
// assertion has moved to components/users/user-form-dialog.test.tsx's
// "UserFormDialog — edit mode" describe block — it only needs a `user` prop,
// not a real row/login/dev server. The first test below keeps its own name
// for the row it creates and edits, but only asserts on the dialog to drive
// into the actual behavior under test: that saving with the password field
// left blank really does leave the password hash unchanged server-side,
// which only a real backend can prove.
//
// Every test loads the shared ADMIN storageState snapshot (e2e/auth.setup.ts)
// rather than driving a UI login for the *editing* steps — the login flow
// itself is covered by e2e/login.spec.ts. Two tests below do drive a real UI
// login, but only as a black-box way to prove a password hash did or didn't
// change server-side (there's no other way to observe that from a spec).
//
// Shared-state isolation: fullyParallel workers share one test DB that's
// reset only once for the whole suite run (e2e/global-setup.ts). Tests that
// need to edit *something* create their own throwaway user first (via the
// existing "New user" dialog, with an email unique to the attempt — see the
// comment on the same pattern in e2e/admin-create-user.spec.ts for why
// test.info().testId alone isn't enough and Date.now() is appended too)
// rather than mutating the seeded AGENT/ADMIN rows other specs assert on — with one
// deliberate, documented exception: the last test below edits the seeded
// ADMIN's own name (to exercise the self-edit navbar refresh, which only
// fires for the *actually logged-in* user) and restores it in a `finally`
// block before the test ends. That mirrors how e2e/admin-create-user.spec.ts
// already documents its one deliberate seeded-fixture-adjacent exception (its
// duplicate-email test targets ADMIN.email read-only); this one is a real,
// if brief, mutation, so if it ever surfaces as flaky alongside
// e2e/login.spec.ts's "logs in as the seeded admin" test (which asserts on
// ADMIN.name), that shared window is why — see the test's own comment.

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

test.describe("admin editing a user from /users", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("opens pre-filled with the row's current name/email and an empty password field, and saving with the password left blank leaves it unchanged", async ({
    page,
    browser,
  }) => {
    const email = `e2e-edit-user-nopass-${test.info().testId}-${Date.now()}@example.com`;
    const originalName = "Edit Test Original Name";
    const originalPassword = "originalpass123";
    const updatedName = "Edit Test No Password Change";

    await page.goto("/users");
    await createUserViaUi(page, { name: originalName, email, password: originalPassword });

    const row = page.getByRole("row", { name: new RegExp(email) });
    // Anchored at the start (not a bare /edit/i) — since the delete-user
    // feature added a same-row Delete button, a loose "contains edit"
    // match would also catch it for any row whose fixture name happens to
    // contain the word "Edit" (several below do, e.g. "Edit Test New
    // Password" → accessible name "Delete Edit Test New Password").
    await row.getByRole("button", { name: /^edit /i }).click();

    // The pre-fill assertions themselves (name/email/blank-password values
    // on open) now live in components/users/user-form-dialog.test.tsx's
    // "opens pre-filled..." test — what this test actually needs to prove is
    // the server-side "blank password = unchanged" contract below, which
    // does need a real backend and login.
    const dialog = page.getByRole("dialog", { name: "Edit user" });

    await dialog.getByLabel("Name").fill(updatedName);
    // Password field deliberately left blank.
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(dialog).toBeHidden();
    await expect(row.getByRole("cell", { name: updatedName, exact: true })).toBeVisible();

    // Can't assert a password hash directly — prove it wasn't touched by
    // driving a real, fresh, unauthenticated login with the *original*
    // password. storageState: undefined is load-bearing here, not a no-op:
    // this file's test.use({ storageState: ADMIN_STORAGE_STATE }) is the
    // default for browser.newContext() too (it inherits ambient test
    // options, same as it would for e.g. viewport), so omitting this would
    // silently hand loginPage the admin's own session cookie — /login would
    // then redirect it straight to "/" as already-authenticated instead of
    // ever rendering the form this test needs to fill in.
    const context = await browser.newContext({ storageState: undefined });
    const loginPage = await context.newPage();
    await loginPage.goto("/login");
    await loginPage.getByLabel("Email").fill(email);
    await loginPage.getByLabel("Password").fill(originalPassword);
    await loginPage.getByRole("button", { name: "Log in" }).click();

    await expect(loginPage).toHaveURL("/");
    await expect(
      loginPage.getByRole("heading", { name: new RegExp(`welcome back, ${updatedName}`, "i") })
    ).toBeVisible();

    await context.close();
  });

  test("editing with a new password changes it", async ({ page, browser }) => {
    const email = `e2e-edit-user-newpass-${test.info().testId}-${Date.now()}@example.com`;
    const originalPassword = "originalpass123";
    const newPassword = "brandnewpassword456";
    const name = "Edit Test New Password";

    await page.goto("/users");
    await createUserViaUi(page, { name, email, password: originalPassword });

    const row = page.getByRole("row", { name: new RegExp(email) });
    await row.getByRole("button", { name: /^edit /i }).click();

    const dialog = page.getByRole("dialog", { name: "Edit user" });
    await dialog.getByLabel("New password").fill(newPassword);
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(dialog).toBeHidden();

    // storageState: undefined here too — see the comment on the same line
    // in the previous test for why it's required, not redundant.
    const context = await browser.newContext({ storageState: undefined });
    const loginPage = await context.newPage();
    await loginPage.goto("/login");
    await loginPage.getByLabel("Email").fill(email);
    await loginPage.getByLabel("Password").fill(newPassword);
    await loginPage.getByRole("button", { name: "Log in" }).click();

    await expect(loginPage).toHaveURL("/");
    await expect(
      loginPage.getByRole("heading", { name: new RegExp(`welcome back, ${name}`, "i") })
    ).toBeVisible();

    await context.close();
  });

  test("shows the server's 409 error when editing an email to a duplicate and keeps the modal open", async ({
    page,
  }) => {
    const email = `e2e-edit-user-conflict-${test.info().testId}-${Date.now()}@example.com`;

    await page.goto("/users");
    const row = await createUserViaUi(page, {
      name: "Duplicate Edit Attempt",
      email,
      password: "supersecret123",
    });

    await row.getByRole("button", { name: /^edit /i }).click();
    const dialog = page.getByRole("dialog", { name: "Edit user" });
    // Targets the seeded admin's email on purpose, read-only — see the
    // isolation note at the top of this file (mirrors
    // e2e/admin-create-user.spec.ts's duplicate-email test).
    await dialog.getByLabel("Email").fill(ADMIN.email);
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(dialog.getByRole("alert")).toHaveText("A user with this email already exists");
    await expect(dialog).toBeVisible();

    // No mutation actually happened — the throwaway user's row still shows
    // its original email, not the admin's.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row.getByRole("cell", { name: email, exact: true })).toBeVisible();
  });

  test("editing your own row updates the navbar without a manual reload", async ({ page }) => {
    const updatedName = `Admin Renamed ${test.info().testId}`;

    await page.goto("/users");
    const adminRow = page.getByRole("row", { name: new RegExp(ADMIN.email) });
    await expect(adminRow).toBeVisible();

    try {
      await adminRow.getByRole("button", { name: /^edit /i }).click();
      const dialog = page.getByRole("dialog", { name: "Edit user" });
      await dialog.getByLabel("Name").fill(updatedName);
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await expect(dialog).toBeHidden();

      await expect(adminRow.getByRole("cell", { name: updatedName, exact: true })).toBeVisible();
      // The navbar reads from the separate ["session"] query
      // (hooks/use-current-user.ts), not ["users"] — this is what proves
      // hooks/use-update-user.ts's conditional `["session"]` invalidation
      // actually fires for a self-edit, without a page.reload().
      await expect(page.locator("header").getByText(updatedName, { exact: true })).toBeVisible();
    } finally {
      // Deliberate mutation of the seeded ADMIN fixture's name (see the
      // isolation note at the top of this file) — always restore it, even if
      // an assertion above failed, so this test never leaves the shared
      // fixture renamed for whichever spec runs next.
      await adminRow.getByRole("button", { name: /^edit /i }).click();
      const restoreDialog = page.getByRole("dialog", { name: "Edit user" });
      await restoreDialog.getByLabel("Name").fill(ADMIN.name);
      await restoreDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(restoreDialog).toBeHidden();
      await expect(adminRow.getByRole("cell", { name: ADMIN.name, exact: true })).toBeVisible();
    }
  });
});

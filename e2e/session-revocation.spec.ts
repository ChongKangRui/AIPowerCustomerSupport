import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STORAGE_STATE } from "./storage-state";

// Coverage for session-revocation/logout redirect hardening, on top of what
// e2e/logout.spec.ts already proves (a deliberate logout ends the session and
// a subsequent /login-bound navigation stays there). This file targets what's
// new here specifically:
//
// 1. app/(main)/layout.tsx now runs its own server-side auth() check and
//    redirects to /login when the session cookie no longer points at a valid
//    Session row — e.g. an admin deleting the account, which calls
//    destroyAllUserSessions (lib/session.ts). Previously a page like the home
//    page could render a logged-out-looking fallback in place instead of
//    actually leaving the page.
// 2. components/navbar.tsx's logout handler now uses router.replace, not
//    router.push, so the just-left protected page's history entry is
//    overwritten rather than kept reachable via the browser's Back button.
//
// The other two navbar fixes described in the task (the useEffect that
// redirects the instant useCurrentUser() resolves to no user while mounted,
// and the pageshow/persisted bfcache-restore listener that calls
// router.refresh()) aren't covered here as their own assertions: both are
// client-side nuances of *how* a redirect that's already exercised below
// eventually fires (a stale in-memory query resolving to null, and a real
// browser bfcache restore respectively) rather than a distinct, reliably
// triggerable observable outcome from a Playwright spec — forcing either
// deterministically (without waitForTimeout-style polling, which this
// project's conventions rule out) would be flaky or would require reaching
// into internals no test in this suite otherwise touches. The
// server-side-redirect-on-navigation case below is what's actually
// deterministic to assert on, and is also the one the task calls out as most
// reliably testable.
//
// Shared-state isolation: every test here creates its own throwaway user
// (via the existing "New user" dialog, with an email unique to the attempt —
// same test.info().testId + Date.now() reasoning as
// e2e/admin-create-user.spec.ts's top-of-file comment) and only ever deletes
// or logs out of that row, never the seeded AGENT/ADMIN fixtures other specs
// rely on. Each test uses two independent browser contexts: one authenticated
// as the seeded ADMIN (to create/delete the throwaway user via the real
// /users UI and API, mirroring e2e/admin-delete-user.spec.ts), and one for
// the throwaway user's own, separate login/cookie jar (to observe the
// redirect) — same multi-context shape e2e/admin-edit-user.spec.ts and
// e2e/admin-delete-user.spec.ts already use.

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

test.describe("session revocation", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("a session revoked by an admin deleting the account redirects to /login on the next navigation, instead of silently staying", async ({
    page,
    browser,
    request,
  }) => {
    const email = `e2e-session-revocation-${test.info().testId}-${Date.now()}@example.com`;
    const password = "supersecret123";
    const name = "Session Revocation Target";

    // Admin creates the throwaway user via the real UI.
    await page.goto("/users");
    await createUserViaUi(page, { name, email, password });

    // The target user's own, independent login/cookie jar — deliberately not
    // the admin's storageState (see the comment on the identical pattern in
    // e2e/admin-delete-user.spec.ts's login-lockout test for why
    // storageState: undefined is load-bearing here, not a no-op).
    const targetContext = await browser.newContext({ storageState: undefined });
    const targetPage = await targetContext.newPage();
    await targetPage.goto("/login");
    await targetPage.getByLabel("Email").fill(email);
    await targetPage.getByLabel("Password").fill(password);
    await targetPage.getByRole("button", { name: "Log in" }).click();

    await expect(targetPage).toHaveURL("/");
    await expect(
      targetPage.getByRole("heading", { name: new RegExp(`welcome back, ${name}`, "i") })
    ).toBeVisible();

    // Admin deletes the account server-side via the API (same
    // request-context-reuse pattern as e2e/admin-delete-user.spec.ts's
    // "admins can never be deleted" test) — this destroys the target's
    // Session row via destroyAllUserSessions, but never touches the cookie
    // already sitting in targetContext.
    const usersResponse = await request.get("/api/users");
    expect(usersResponse.status()).toBe(200);
    const { users } = await usersResponse.json();
    const targetUser = users.find((u: { email: string }) => u.email === email);
    expect(targetUser).toBeDefined();

    const deleteResponse = await request.delete(`/api/users/${targetUser.id}`);
    expect(deleteResponse.status()).toBe(204);

    // The target's browser still holds the (now-orphaned) session cookie.
    // Revisiting a protected page must redirect to /login via
    // app/(main)/layout.tsx's server-side auth() check — not silently render
    // a logged-out-looking fallback in place, which was the pre-fix bug.
    await targetPage.goto("/");
    await expect(targetPage).toHaveURL(/\/login$/);

    await targetContext.close();
  });

  test("logging out overwrites history via replace, so Back from /login does not reveal the protected page again", async ({
    page,
    browser,
  }) => {
    const email = `e2e-session-revocation-back-${test.info().testId}-${Date.now()}@example.com`;
    const password = "supersecret123";
    const name = "Session Revocation Back Button";

    await page.goto("/users");
    await createUserViaUi(page, { name, email, password });

    const targetContext = await browser.newContext({ storageState: undefined });
    const targetPage = await targetContext.newPage();
    await targetPage.goto("/login");
    await targetPage.getByLabel("Email").fill(email);
    await targetPage.getByLabel("Password").fill(password);
    await targetPage.getByRole("button", { name: "Log in" }).click();

    await expect(targetPage).toHaveURL("/");
    await expect(
      targetPage.getByRole("heading", { name: new RegExp(`welcome back, ${name}`, "i") })
    ).toBeVisible();

    // Log out via the actual navbar control, same as e2e/logout.spec.ts.
    await targetPage.getByRole("button", { name }).click();
    await targetPage.getByRole("menuitem", { name: /log out/i }).click();
    await expect(targetPage).toHaveURL("/login");

    // Pressing Back must not land the user looking at the protected page's
    // content again — components/navbar.tsx's logout handler uses
    // router.replace, not router.push, specifically so the just-left "/"
    // entry is overwritten rather than kept reachable this way. Assert on
    // the final resting state/URL rather than intermediate navigation
    // events — exact bfcache/back-button behavior in headless Chromium can
    // vary, but the observable outcome (never showing the authenticated
    // heading again) shouldn't.
    await targetPage.goBack();
    await expect(
      targetPage.getByRole("heading", { name: new RegExp(`welcome back, ${name}`, "i") })
    ).toBeHidden();
    // Where exactly Back lands depends on how much history existed before
    // this test's own navigations — and both real possibilities are
    // correct here: login-form.tsx's post-login redirect and navbar.tsx's
    // logout redirect *both* use router.replace, so "/" was never pushed
    // as its own independently-reachable entry to begin with. In this
    // fresh, nearly-history-less test context that means Back lands on
    // the browser's own initial about:blank (whose pathname is literally
    // "blank"); a real user with actual prior browsing history would
    // instead land back on /login. Either way, the heading assertion
    // above is the real proof — the protected page's content is never
    // shown again.
    const url = new URL(targetPage.url());
    expect(["/login", "blank"]).toContain(url.pathname);

    await targetContext.close();
  });
});

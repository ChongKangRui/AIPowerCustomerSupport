import { expect, test as setup } from "@playwright/test";

import { ADMIN, AGENT } from "./seeded-users";
import { ADMIN_STORAGE_STATE, AGENT_STORAGE_STATE } from "./storage-state";

// Runs once per suite run, as its own Playwright project (see
// playwright.config.ts's `setup` project + the `chromium` project's
// `dependencies: ["setup"]`) — before any spec that needs to start out
// already logged in.
//
// Logs in through POST /api/login directly (the same Route Handler the UI
// form calls) rather than driving the actual /login form — the login *flow*
// itself (typed credentials, validation, demo buttons, error states) is
// already covered end-to-end by e2e/login.spec.ts; specs loading this
// storageState only need the resulting session cookie, not to re-prove the
// form works.
//
// IMPORTANT — shared-state gotcha: every spec that loads one of these
// storageState files gets the *same* session token (a snapshot of this one
// login, not a fresh login per test). That's safe for read-only checks
// (visiting a page, asserting what renders) but a spec must never destroy
// this session (e.g. call POST /api/logout) while using this storageState —
// doing so would delete the DB Session row out from under every other test
// running in parallel against the same file. Specs that need to log out
// establish their own independent login instead (see e2e/logout.spec.ts).
setup("authenticate as seeded agent", async ({ page }) => {
  const response = await page.request.post("/api/login", {
    data: { email: AGENT.email, password: AGENT.password },
  });
  expect(response.ok()).toBeTruthy();

  await page.context().storageState({ path: AGENT_STORAGE_STATE });
});

setup("authenticate as seeded admin", async ({ page }) => {
  const response = await page.request.post("/api/login", {
    data: { email: ADMIN.email, password: ADMIN.password },
  });
  expect(response.ok()).toBeTruthy();

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});

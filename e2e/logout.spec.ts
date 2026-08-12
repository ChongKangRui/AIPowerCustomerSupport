import { expect, test } from "@playwright/test";

import { AGENT } from "./seeded-users";

// Logout genuinely mutates shared state (deletes a DB `Session` row), so
// this file deliberately does NOT load the shared storageState snapshots
// from e2e/auth.setup.ts (e2e/.auth/*.json) — every test below logs in
// through its own fresh session first. Ending that session can then never
// pull the rug out from under some other spec that's using the shared
// snapshot in parallel.

test("logging out ends the session, and a previously-reachable protected route redirects to /login again", async ({
  page,
}) => {
  // Own, independent login — POST /api/login directly (same endpoint the UI
  // form calls; the form itself is covered by e2e/login.spec.ts).
  const loginResponse = await page.request.post("/api/login", {
    data: { email: AGENT.email, password: AGENT.password },
  });
  expect(loginResponse.ok()).toBeTruthy();

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: new RegExp(`welcome back, ${AGENT.name}`, "i") })
  ).toBeVisible();

  // Log out via the actual UI control (navbar avatar menu → "Log out").
  await page.getByRole("button", { name: AGENT.name }).click();
  await page.getByRole("menuitem", { name: /log out/i }).click();

  await expect(page).toHaveURL("/login");

  // The session is really gone server-side, not just the client-side query
  // cache — the previously-reachable protected root now bounces back to
  // /login again, same as a never-logged-in visitor.
  await page.goto("/");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("callbackUrl")).toBe("/");
});

test("logging out with no active session is still a no-op success, not an error", async ({
  request,
}) => {
  const response = await request.post("/api/logout");

  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({ success: true });
});

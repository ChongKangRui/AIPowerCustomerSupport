import { expect, test } from "@playwright/test";

import { ADMIN, AGENT } from "./seeded-users";

// No storageState is configured for this file — every test here starts from
// a clean, unauthenticated browser context and drives the real /login form,
// since the form itself (not just "being logged in") is what's under test.
// None of these tests write anything another test could race on: each
// successful login only creates its own new Session row, and failed logins
// don't touch the DB at all. Repeated failed logins for the same seeded
// email (see the "invalid credentials" describe below) are also safe to run
// in parallel with other specs logging in as that same account: lib/
// rate-limiter.ts only gates on `RATE_LIMITING_ENABLED`, which is `NODE_ENV
// === "production"` only — this suite's webServer runs `next dev`, so no
// email+IP or per-IP counter is ever read or written here.
//
// Pure client-side behavior that doesn't need a real backend has moved to
// app/login/login-form.test.tsx (a Vitest + Testing Library component test):
// the "client-side validation" describe block (empty email, empty password,
// malformed email — all just react-hook-form + zodResolver blocking a
// submit) and the demo-account buttons' plain autofill-without-submit case.
// What's left here is scoped to cases that only mean something against a
// real dev server + database: a successful login actually creating a
// session and redirecting, the generic invalid-credentials message actually
// coming back from app/api/login/route.ts for both a wrong password and a
// nonexistent email, and clicking a demo button *then submitting* to prove
// the autofilled credentials really do authenticate.

test.describe("successful login", () => {
  test("logs in as the seeded agent with typed credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(AGENT.email);
    await page.getByLabel("Password").fill(AGENT.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: new RegExp(`welcome back, ${AGENT.name}`, "i") })
    ).toBeVisible();
  });

  test("logs in as the seeded admin with typed credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: new RegExp(`welcome back, ${ADMIN.name}`, "i") })
    ).toBeVisible();
  });
});

test.describe("demo account buttons", () => {
  // The plain "clicking a demo button autofills the form without
  // submitting" case now lives in app/login/login-form.test.tsx's "demo
  // account buttons" describe block — it's pure client-side state, no
  // backend involved. What stays here needs a real login round trip.
  test("submitting after clicking a demo account button logs in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Demo agent" }).click();
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: new RegExp(`welcome back, ${AGENT.name}`, "i") })
    ).toBeVisible();
  });
});

test.describe("invalid credentials", () => {
  // app/api/login/route.ts deliberately returns the exact same status +
  // message for "wrong password" and "no such user" — asserting the literal
  // text here is the point of both tests below, not incidental.
  const EXPECTED_MESSAGE = "Invalid email or password";

  test("wrong password for an existing account shows a generic invalid-credentials error", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(AGENT.email);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(EXPECTED_MESSAGE);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a nonexistent email shows the exact same generic error as a wrong password", async ({
    page,
  }) => {
    await page.goto("/login");
    await page
      .getByLabel("Email")
      .fill(`no-such-user-${test.info().testId}@example.com`);
    await page.getByLabel("Password").fill("whatever-1234");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(EXPECTED_MESSAGE);
    await expect(page).toHaveURL(/\/login$/);
  });
});

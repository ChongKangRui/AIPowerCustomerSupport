import { expect, test } from "@playwright/test";

import { ADMIN, AGENT } from "./seeded-users";

// No storageState is configured for this file — every test here starts from
// a clean, unauthenticated browser context and drives the real /login form,
// since the form itself (not just "being logged in") is what's under test.
// None of these tests write anything another test could race on: each
// successful login only creates its own new Session row, and failed logins
// don't touch the DB at all (see e2e/rate-limiting.spec.ts for more on why
// hammering the same email with wrong passwords is also safe here).

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
  test("autofill the matching seeded credentials without submitting", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: "Demo agent" }).click();
    await expect(page.getByLabel("Email")).toHaveValue(AGENT.email);
    await expect(page.getByLabel("Password")).toHaveValue(AGENT.password);
    // Still on /login — clicking the demo button only fills the form.
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole("button", { name: "Demo admin" }).click();
    await expect(page.getByLabel("Email")).toHaveValue(ADMIN.email);
    await expect(page.getByLabel("Password")).toHaveValue(ADMIN.password);
    await expect(page).toHaveURL(/\/login$/);
  });

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

test.describe("client-side validation", () => {
  test("shows an inline error and blocks submission when email is empty", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill(AGENT.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows an inline error and blocks submission when password is empty", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(AGENT.email);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows an inline error and blocks submission for a malformed email", async ({ page }) => {
    await page.goto("/login");
    // No "@" at all — invalid under any trim/lowercase ordering the schema
    // might apply, so this doesn't depend on models/auth.model.ts's exact
    // z.email().trim().toLowerCase() chain order.
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill(AGENT.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
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

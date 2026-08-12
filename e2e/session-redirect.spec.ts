import { expect, test } from "@playwright/test";

import { ADMIN, AGENT } from "./seeded-users";
import { ADMIN_STORAGE_STATE, AGENT_STORAGE_STATE } from "./storage-state";

// Covers proxy.ts's cookie-presence route protection, lib/safe-redirect.ts's
// open-redirect guard (both the "redirected to /login" and "logged in, now
// redirected" ends of that guard), and the two server-side "already have a
// session, don't show me this page" redirects (app/login/page.tsx and
// app/(main)/users/page.tsx). All read-only: nothing here writes ticket/user
// data, so it's safe to run fully in parallel with every other spec.

test.describe("unauthenticated route protection (proxy.ts)", () => {
  // proxy.ts only matches "/", "/dashboard/:path*", "/tickets/:path*",
  // "/admin/:path*" — "/" is the only one of those with a real page built so
  // far (see implementation-plan.md Phase 3), but the proxy redirect itself
  // fires before Next.js even tries to resolve a page, so asserting it
  // against "/dashboard/anything" (no page.tsx yet) is still valid coverage
  // of the matcher/redirect logic itself.

  test("visiting the protected root with no session redirects to /login with a callbackUrl", async ({
    page,
  }) => {
    await page.goto("/");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe("/");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  });

  test("visiting a nested protected path with no session redirects with the original path as callbackUrl", async ({
    page,
  }) => {
    await page.goto("/dashboard/anything");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe("/dashboard/anything");
  });
});

test.describe("callbackUrl redirect target on successful login", () => {
  test("a legitimate same-origin callbackUrl is honored after login", async ({ page }) => {
    await page.goto(`/login?callbackUrl=${encodeURIComponent("/users")}`);
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("an absolute off-site callbackUrl is ignored — lands on / instead (open-redirect guard)", async ({
    page,
  }) => {
    await page.goto(`/login?callbackUrl=${encodeURIComponent("https://evil.example")}`);
    await page.getByLabel("Email").fill(AGENT.email);
    await page.getByLabel("Password").fill(AGENT.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL("/");
  });

  test("a protocol-relative callbackUrl is ignored — lands on / instead (open-redirect guard)", async ({
    page,
  }) => {
    await page.goto(`/login?callbackUrl=${encodeURIComponent("//evil.example")}`);
    await page.getByLabel("Email").fill(AGENT.email);
    await page.getByLabel("Password").fill(AGENT.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL("/");
  });
});

test.describe("already-authenticated agent", () => {
  test.use({ storageState: AGENT_STORAGE_STATE });

  test("visiting /login redirects away instead of showing the form", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Log in" })).toHaveCount(0);
  });

  test("a malicious callbackUrl on /login still lands on / for an already-logged-in user", async ({
    page,
  }) => {
    // Exercises app/login/page.tsx's own safeRedirectTarget call (the
    // server-side "already have a session" redirect), not the login-form
    // one covered above.
    await page.goto(`/login?callbackUrl=${encodeURIComponent("https://evil.example")}`);

    await expect(page).toHaveURL("/");
  });

  test("the previously-protected root is directly reachable once authenticated", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: new RegExp(`welcome back, ${AGENT.name}`, "i") })
    ).toBeVisible();
  });

  test("an agent visiting the admin-only /users page is redirected home", async ({ page }) => {
    // /users isn't in proxy.ts's matcher — this is the page's own
    // session+role check (app/(main)/users/page.tsx), not proxy.ts.
    await page.goto("/users");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  });
});

test.describe("already-authenticated admin", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("an admin can reach the admin-only /users page directly", async ({ page }) => {
    await page.goto("/users");

    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });
});

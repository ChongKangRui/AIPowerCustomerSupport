import { expect, test, type Page } from "@playwright/test";

import { ADMIN_STORAGE_STATE, AGENT_STORAGE_STATE } from "./storage-state";

// Finds a shadcn CardTitle (data-slot="card-title") with exactly this text.
// :text-is() is Playwright's exact-text CSS pseudo-class — no regex
// escaping needed even for titles with punctuation like "AI vs. Agent
// Resolved". See the comment at its call site for why this exists instead
// of a plain page.getByText(title, { exact: true }).
function cardTitle(page: Page, text: string) {
  return page.locator(`[data-slot="card-title"]:text-is("${text}")`);
}

// Coverage for the admin-only "Dashboard" feature: app/(main)/dashboard/page.tsx,
// components/dashboard/dashboard-view.tsx + its stat/chart cards, and
// GET /api/dashboard/stats + GET /api/dashboard/charts.
//
// Everything here is read-only — the dashboard has no mutations — so unlike
// e2e/admin-create-user.spec.ts there's no test-isolation concern, and every
// test can share ADMIN_STORAGE_STATE/AGENT_STORAGE_STATE (e2e/auth.setup.ts)
// like e2e/users.spec.ts does, rather than logging in through the UI.
//
// What's deliberately NOT here, because it's already covered more cheaply
// elsewhere:
// - The month-bucketing/date-math behind the chart numbers:
//   lib/dashboard-analytics.test.ts.
// - Loading/error/success rendering wiring for both queries, against mocked
//   data: components/dashboard/dashboard-view.test.tsx.
// This file only proves the parts that need a real browser + server + DB to
// mean anything: a real round trip against real seeded data, and that the
// admin-only gate is actually enforced at both the page and the API layer.

test.describe("admin viewing the dashboard", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("sees the stat cards and charts populated from a real round trip", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // All six stat card labels, plus the three chart titles below. Scoped to
    // [data-slot="card-title"] (shadcn's CardTitle, components/ui/card.tsx),
    // not plain page.getByText — even with exact: true, "Agent-Resolved" and
    // "AI-Resolved" are also the literal strings the AI-vs-Agent chart's own
    // legend renders (ChartLegendContent, components/ui/chart.tsx), so
    // page.getByText would still resolve two real, identically-worded
    // elements: this stat card's title and that chart's legend entry.
    // Legend items are plain divs with no data-slot, so this scoping rules
    // them out without needing to know anything about their position.
    for (const title of [
      "Active Agents",
      "Inactive Agents",
      "Total Tickets Resolved",
      "Agent-Resolved",
      "AI-Resolved",
      "Avg Tickets / Month",
      "Ticket Volume",
      "AI vs. Agent Resolved",
      "Resolution Time",
    ]) {
      await expect(cardTitle(page, title)).toBeVisible();
    }

    // Not asserting an exact seeded count (fragile, same reasoning as
    // e2e/users.spec.ts) — just that the "Active Agents" stat card rendered
    // a real number rather than nothing/NaN/undefined.
    //
    // `[data-slot="card"]` scopes to the one Card that contains this
    // label, so this doesn't accidentally match a number rendered inside
    // one of the chart cards below it. It's shadcn/ui's own structural
    // attribute (components/ui/card.tsx) present on every Card in this
    // codebase, not an invented test-id.
    //
    // The start-anchored regex (not a plain string) is the same fix as
    // above: filter({ hasText }) substring-matches too, so an unanchored
    // "Active Agents" would resolve both this card and the Inactive
    // Agents one. Only a start anchor, not a full ^...$ match — hasText
    // matches the card's whole concatenated text (label + the number
    // below it), not just the label on its own.
    const activeAgentsCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: /^Active Agents/ });
    await expect(activeAgentsCard.getByText(/^\d+$/)).toBeVisible();
  });

  test("shows the Dashboard link in the navbar", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  });
});

test.describe("access control", () => {
  test.describe("as an authenticated agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("is redirected home instead of seeing the admin-only page", async ({ page }) => {
      // Past proxy.ts (a session cookie is present) — this is
      // app/(main)/dashboard/page.tsx's own DB-verified role check.
      await page.goto("/dashboard");

      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);
    });

    test("does not see the Dashboard link in the navbar", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
    });
  });
});

test.describe("GET /api/dashboard/stats", () => {
  // Access control only, same rationale as e2e/users.spec.ts's GET
  // /api/users block: the route checks session/role itself, independent of
  // the page-level redirect above, so a redirect-only test wouldn't prove
  // the API enforces it too.
  test("returns 401 with no session", async ({ request }) => {
    const response = await request.get("/api/dashboard/stats");
    expect(response.status()).toBe(401);
  });

  test.describe("as an authenticated agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("returns 403 — agents aren't admins", async ({ request }) => {
      const response = await request.get("/api/dashboard/stats");
      expect(response.status()).toBe(403);
    });
  });

  test.describe("as an authenticated admin", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test("returns the documented flat stats shape", async ({ request }) => {
      const response = await request.get("/api/dashboard/stats");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body).toEqual(
        expect.objectContaining({
          activeAgents: expect.any(Number),
          inactiveAgents: expect.any(Number),
          totalResolved: expect.any(Number),
          agentResolved: expect.any(Number),
          aiResolved: expect.any(Number),
          avgTicketsPerMonth: expect.any(Number),
        })
      );
    });
  });
});

test.describe("GET /api/dashboard/charts", () => {
  test("returns 401 with no session", async ({ request }) => {
    const response = await request.get("/api/dashboard/charts");
    expect(response.status()).toBe(401);
  });

  test.describe("as an authenticated agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("returns 403 — agents aren't admins", async ({ request }) => {
      const response = await request.get("/api/dashboard/charts");
      expect(response.status()).toBe(403);
    });
  });

  test.describe("as an authenticated admin", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test("returns a points array in the documented shape", async ({ request }) => {
      const response = await request.get("/api/dashboard/charts");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body.points)).toBe(true);
      // A rolling 6-month window always has 6 buckets, even if some are
      // empty — this doesn't depend on how many tickets actually exist.
      expect(body.points).toHaveLength(6);
      expect(body.points[0]).toEqual(
        expect.objectContaining({
          month: expect.any(String),
          label: expect.any(String),
          ticketsCreated: expect.any(Number),
          ticketsResolved: expect.any(Number),
          agentResolved: expect.any(Number),
          aiResolved: expect.any(Number),
        })
      );
    });
  });
});

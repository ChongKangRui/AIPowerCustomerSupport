import { expect, test } from "@playwright/test";

import { TicketStatus } from "@/lib/generated/prisma/enums";
import { TICKET_PAGE_SIZE } from "@/models/ticket.model";
import { AGENT } from "./seeded-users";
import { ADMIN_STORAGE_STATE, AGENT_STORAGE_STATE } from "./storage-state";
import {
  seedManyTicketFixtures,
  seedTicketFixtures,
  type TicketFixture,
  type TicketFixtures,
} from "./ticket-fixtures";

// Coverage for the ticket list feature: app/(main)/tickets/page.tsx,
// components/tickets/tickets-view.tsx + tickets-table.tsx, hooks/use-tickets.ts,
// and GET /api/tickets (app/api/tickets/route.ts). No search/filter UI exists
// yet (implementation-plan.md Phase 3 — that's a later increment), so this
// file only covers listing, server-side sort order, and role-scoped
// visibility — the actual correctness property this feature exists for.
// There's also no page-level role redirect (unlike /users): any authenticated
// user can view /tickets, and GET /api/tickets' `where` clause is the sole
// authoritative enforcement of "agents only see their own assigned tickets"
// (see that route's comment) — so "access control" below only has an
// unauthenticated-visitor case, not an agent-redirected-away one.
//
// Test data: tickets are Gmail-inbound only in production — there's no
// creation UI or API to drive, and prisma/seed.ts only seeds the two demo
// users (see e2e/seeded-users.ts). e2e/ticket-fixtures.ts writes three
// ticket rows directly via Prisma (own connection to the test database —
// see that file's comment for why it can't reuse lib/prisma.ts's singleton):
// one assigned to the seeded Agent, one unassigned, one assigned to a
// throwaway second agent, with distinct/staggered createdAt timestamps. That
// single fixture set is enough to cover sorting and both ends of
// role-scoping (including proving "admin sees all" isn't accidentally
// "admin sees own"), without needing separate rows per test.
//
// The "Unassigned" rendering case (a ticket with assignedTo: null showing
// the literal text "Unassigned" in its row) has moved to
// components/tickets/tickets-table.test.tsx — TicketsTable is pure/
// presentational, driven only by its `tickets` prop, so that's cheap to
// cover directly with a fixture object instead of a real seeded DB row and
// full login/browser round trip. What stays here is what only a real
// backend can prove: the server-side sort order and role-scoping GET
// /api/tickets actually returns, and the page rendering that real data.
//
// Shared-state isolation: unlike e2e/users.spec.ts (whose read-only tests
// are safe to run fully in parallel against the two fixed seeded users),
// this file's assertions depend on knowing the *exact* fixture set — an
// admin-sees-all test can't tell "sees every ticket" from "sees every ticket
// except the ones some other worker's redundant reseed created" if the fixture
// were re-created once per worker. `mode: "serial"` below forces this whole
// file into a single worker, so seedTicketFixtures() runs exactly once (from
// the top-level beforeAll), same DB the entire file's tests then only read.
//
// A second fixture set, seeded alongside the 3-row one above, backs the
// server-side sort/pagination coverage further down (GET /api/tickets ->
// page/sortBy/sortDir params, response shape's total/page/pageSize). It's
// unassigned (admin-visible, agent-invisible) and anchored a full day further
// into the past than the 3-row set — see ticket-fixtures.ts's comment on
// seedManyTicketFixtures for why that ordering choice keeps the pre-existing
// "sorts newest-first" tests above passing unmodified: the 3-row set always
// sorts ahead of these 25 rows under the default createdAt-desc order, so it
// stays within page 1 regardless of this larger set's existence.
test.describe.configure({ mode: "serial" });

const PAGINATION_FIXTURE_COUNT = 25;

let fixtures: TicketFixtures;
let paginationFixtures: TicketFixture[];

test.beforeAll(async () => {
  fixtures = await seedTicketFixtures();
  paginationFixtures = await seedManyTicketFixtures(PAGINATION_FIXTURE_COUNT);
});

test.describe("admin viewing the tickets list", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("sees every ticket regardless of assignment, including an unassigned one", async ({
    page,
  }) => {
    await page.goto("/tickets");

    await expect(
      page.getByRole("row", { name: new RegExp(fixtures.oldest.subject) })
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(fixtures.middle.subject) })
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(fixtures.newest.subject) })
    ).toBeVisible();
  });

  test("orders tickets newest-first by createdAt", async ({ page }) => {
    await page.goto("/tickets");

    // Wait for the real fetch (not the skeleton) to settle before reading
    // table order.
    await expect(
      page.getByRole("row", { name: new RegExp(fixtures.newest.subject) })
    ).toBeVisible();

    // Data rows only — role="row" also matches the <thead> header row, which
    // has no role="cell" children (its cells are columnheaders), so this
    // filter excludes it without needing a raw CSS selector.
    const dataRows = page.getByRole("row").filter({ has: page.getByRole("cell") });
    const rowTexts = await dataRows.allTextContents();

    const oldestIndex = rowTexts.findIndex((text) => text.includes(fixtures.oldest.subject));
    const middleIndex = rowTexts.findIndex((text) => text.includes(fixtures.middle.subject));
    const newestIndex = rowTexts.findIndex((text) => text.includes(fixtures.newest.subject));

    expect(oldestIndex).toBeGreaterThanOrEqual(0);
    expect(middleIndex).toBeGreaterThanOrEqual(0);
    expect(newestIndex).toBeGreaterThanOrEqual(0);

    // Newest createdAt renders first (lowest index = topmost row).
    expect(newestIndex).toBeLessThan(middleIndex);
    expect(middleIndex).toBeLessThan(oldestIndex);
  });
});

test.describe("agent viewing the tickets list", () => {
  test.use({ storageState: AGENT_STORAGE_STATE });

  test("sees only tickets assigned to them — not unassigned ones, not another agent's", async ({
    page,
  }) => {
    await page.goto("/tickets");

    await expect(
      page.getByRole("row", { name: new RegExp(fixtures.oldest.subject) })
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(fixtures.middle.subject) })
    ).toHaveCount(0);
    await expect(
      page.getByRole("row", { name: new RegExp(fixtures.newest.subject) })
    ).toHaveCount(0);
  });
});

test.describe("access control", () => {
  test("an unauthenticated visitor is redirected to /login with a callbackUrl back to /tickets", async ({
    page,
  }) => {
    // No storageState loaded — proxy.ts's cookie-presence check fires here.
    // Unlike e2e/users.spec.ts, there's no follow-up "authenticated agent
    // redirected away" case: /tickets has no role gate (see this file's
    // top comment and app/(main)/tickets/page.tsx).
    await page.goto("/tickets");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe("/tickets");
  });
});

test.describe("GET /api/tickets", () => {
  test("returns 401 with no session", async ({ request }) => {
    const response = await request.get("/api/tickets");
    expect(response.status()).toBe(401);
  });

  test.describe("as an authenticated agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("returns only tickets assigned to that agent, in the documented shape", async ({
      request,
    }) => {
      const response = await request.get("/api/tickets");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body.tickets)).toBe(true);

      // Response-envelope shape (added alongside server-side pagination) —
      // `page`/`pageSize` are asserted as literal values, not just presence,
      // since they're documented as "default page 1" and "fixed constant"
      // respectively, not arbitrary numbers.
      expect(body).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          page: 1,
          pageSize: TICKET_PAGE_SIZE,
        })
      );

      const ids = body.tickets.map((ticket: { id: string }) => ticket.id);
      expect(ids).toContain(fixtures.oldest.id);
      expect(ids).not.toContain(fixtures.middle.id);
      expect(ids).not.toContain(fixtures.newest.id);

      // Scoping correctness, not just presence/absence of our own fixtures —
      // every ticket this agent gets back must really be their own,
      // regardless of what else exists in the table.
      for (const ticket of body.tickets) {
        expect(ticket.assignedTo?.id).toBe(fixtures.agentId);
      }

      const ownTicket = body.tickets.find(
        (ticket: { id: string }) => ticket.id === fixtures.oldest.id
      );
      expect(ownTicket).toEqual(
        expect.objectContaining({
          id: fixtures.oldest.id,
          subject: fixtures.oldest.subject,
          status: TicketStatus.OPEN,
          customerEmail: expect.any(String),
          customerName: null,
          assignedTo: { id: fixtures.agentId, name: AGENT.name },
          resolvedByAi: false,
          createdAt: expect.any(String),
        })
      );
    });

    test("stays scoped to the agent's own tickets when sort and page params are present", async ({
      request,
    }) => {
      // Guards against a regression where role-scoping (the `where` clause)
      // only gets applied on the bare, no-query-params path and a sortBy/
      // page combination accidentally bypasses it.
      const response = await request.get("/api/tickets?page=1&sortBy=status&sortDir=asc");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.tickets.length).toBeGreaterThan(0);
      for (const ticket of body.tickets) {
        expect(ticket.assignedTo?.id).toBe(fixtures.agentId);
      }

      const ids = body.tickets.map((ticket: { id: string }) => ticket.id);
      expect(ids).toContain(fixtures.oldest.id);
      // None of the 25 unassigned pagination fixtures should leak through —
      // they're admin-visible only.
      for (const paginationFixture of paginationFixtures) {
        expect(ids).not.toContain(paginationFixture.id);
      }
    });
  });

  test.describe("as an authenticated admin", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test("returns tickets not assigned to the admin — the admin path is unscoped, not self-scoped", async ({
      request,
    }) => {
      const response = await request.get("/api/tickets");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.tickets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: fixtures.oldest.id,
            assignedTo: { id: fixtures.agentId, name: AGENT.name },
          }),
          expect.objectContaining({
            id: fixtures.middle.id,
            assignedTo: null,
          }),
          expect.objectContaining({
            id: fixtures.newest.id,
            assignedTo: { id: fixtures.otherAgentId, name: "Other Agent" },
          }),
        ])
      );
    });

    test("sorts the returned tickets newest-first by createdAt", async ({ request }) => {
      const response = await request.get("/api/tickets");
      const body = await response.json();

      const fixtureIds = [fixtures.oldest.id, fixtures.middle.id, fixtures.newest.id];
      const orderedIds = body.tickets
        .map((ticket: { id: string }) => ticket.id)
        .filter((id: string) => fixtureIds.includes(id));

      expect(orderedIds).toEqual([fixtures.newest.id, fixtures.middle.id, fixtures.oldest.id]);
    });
  });
});

// Server-side pagination and sorting (page/sortBy/sortDir query params —
// models/ticket.model.ts's ticketListQuerySchema, applied via Prisma
// orderBy/skip/take in app/api/tickets/route.ts). Deliberately request-level
// (not UI): what's worth a real browser+server+DB round trip here is the
// actual row order and 20-row cap the database enforces and the interaction
// between pagination/sort params and role-scoping — not clicking a sort
// header or a Previous/Next button, which is already covered against a
// mocked API by components/tickets/tickets-table.test.tsx,
// tickets-pagination.test.tsx, and tickets-view.test.tsx. Garbage/invalid
// query values (negative page, unknown sortBy) are out of scope here too —
// that fallback-to-default behavior is a pure schema concern already covered
// by models/ticket.model.test.ts.
test.describe("GET /api/tickets pagination and sorting", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  // The exact-total/exact-page-reconstruction tests below scope every
  // request with q=E2E Pagination Ticket (the subject prefix every row from
  // seedManyTicketFixtures shares — see ticket-fixtures.ts) rather than
  // asserting against the whole database's ticket count. This file is no
  // longer the only spec that writes Ticket rows (e2e/ticket-detail.spec.ts
  // now does too, per-test), so an admin's unfiltered GET /api/tickets total
  // is no longer a closed, predictable number — it depends on whatever else
  // happens to be running in parallel. Scoping by q sidesteps that entirely:
  // these two tests only need to prove skip/take/total math is internally
  // consistent for a set of rows this file fully owns, not that nothing else
  // in the DB exists.
  const paginationQuery = `q=${encodeURIComponent("E2E Pagination Ticket")}`;

  test("returns a full page of pageSize tickets and the true total, not capped at pageSize", async ({
    request,
  }) => {
    const response = await request.get(`/api/tickets?${paginationQuery}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.tickets).toHaveLength(TICKET_PAGE_SIZE);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(TICKET_PAGE_SIZE);
    expect(body.total).toBe(PAGINATION_FIXTURE_COUNT);
  });

  test("page 2 returns the remaining tickets, with no id overlap and no gap against page 1", async ({
    request,
  }) => {
    const page1Response = await request.get(`/api/tickets?page=1&${paginationQuery}`);
    const page2Response = await request.get(`/api/tickets?page=2&${paginationQuery}`);
    expect(page1Response.status()).toBe(200);
    expect(page2Response.status()).toBe(200);

    const page1Body = await page1Response.json();
    const page2Body = await page2Response.json();

    const page1Ids: string[] = page1Body.tickets.map((ticket: { id: string }) => ticket.id);
    const page2Ids: string[] = page2Body.tickets.map((ticket: { id: string }) => ticket.id);

    expect(page1Ids).toHaveLength(TICKET_PAGE_SIZE);
    expect(page2Ids).toHaveLength(PAGINATION_FIXTURE_COUNT - TICKET_PAGE_SIZE);

    // No overlap: nothing returned on page 1 reappears on page 2.
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toEqual([]);

    // No gap: the two pages together account for every pagination-fixture
    // id, and nothing else — proving `total`/`skip`/`take` are consistent
    // with each other across page boundaries.
    const combinedIds = [...page1Ids, ...page2Ids].sort();
    const expectedIds = paginationFixtures.map((ticket) => ticket.id).sort();
    expect(combinedIds).toEqual(expectedIds);
  });

  test("sortBy=subject&sortDir=asc returns a real, verifiably-correct alphabetical order, different from the default", async ({
    request,
  }) => {
    const defaultResponse = await request.get("/api/tickets");
    const defaultBody = await defaultResponse.json();
    const defaultIds = defaultBody.tickets.map((ticket: { id: string }) => ticket.id);

    const sortedResponse = await request.get("/api/tickets?sortBy=subject&sortDir=asc");
    expect(sortedResponse.status()).toBe(200);
    const sortedBody = await sortedResponse.json();
    const sortedIds = sortedBody.tickets.map((ticket: { id: string }) => ticket.id);

    // Every pagination fixture's subject ("E2E Pagination Ticket NN ...")
    // sorts alphabetically before every 3-row fixture's subject ("E2E Ticket
    // ..." — 'P' < 'T'), so the first (pageSize) rows in ascending-by-subject
    // order are exactly the alphabetically-first pageSize pagination
    // fixtures, independent of createdAt or insertion order.
    const expectedIds = [...paginationFixtures]
      .sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0))
      .slice(0, TICKET_PAGE_SIZE)
      .map((ticket) => ticket.id);

    expect(sortedIds).toEqual(expectedIds);
    expect(sortedIds).not.toEqual(defaultIds);
  });
});

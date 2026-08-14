import crypto from "node:crypto";

import { expect, test } from "@playwright/test";

import { ADMIN_STORAGE_STATE, AGENT_STORAGE_STATE } from "./storage-state";
import {
  createThrowawayAgent,
  getSeededAgentId,
  insertTicket,
  insertTicketMessage,
  withTestDbClient,
  type TicketFixture,
} from "./ticket-fixtures";

// Coverage for the ticket detail feature: app/(main)/tickets/[id]/page.tsx,
// components/tickets/ticket-detail-view.tsx (+ its Mark Resolved/Close
// status actions), and GET/PATCH /api/tickets/[id]
// (app/api/tickets/[id]/route.ts). GET/PATCH's role-scoping mirrors
// GET /api/tickets — see that route's findScopedTicket comment — so the
// negative cases here (404 for a scoped-out agent, on both verbs) are the
// same "404, not 403" contract e2e/tickets.spec.ts already established for
// the list endpoint.
//
// Deliberately NOT covered here (see this file's originating task for the
// full rationale):
//   - The reply textarea/Send button — UI-only, no mutation wired up at all
//     yet, so there's nothing a real backend round trip could prove.
//   - StatusBadge's status->variant mapping, TicketDetailHeader's
//     customer/assignee fallback text, and TicketConversation's per-
//     authorType label/empty-state logic — pure presentational branches,
//     covered by their own co-located RTL component tests
//     (status-badge.test.tsx, ticket-detail-header.test.tsx,
//     ticket-conversation.test.tsx).
//   - Which action buttons show for which status, the Close confirm-dialog
//     wiring itself, and the mutation-error message rendering — covered
//     against a mocked apiClient by ticket-detail-view.test.tsx. What's left
//     for here is only what a mock can't prove: that the real PATCH request
//     round-trips through the real allow-list and is genuinely persisted.
//
// Test data: same rationale as e2e/ticket-fixtures.ts's top comment —
// tickets are Gmail-inbound only, no creation UI/API exists, so every
// fixture below is written directly via raw `pg` through that module.
// insertTicketMessage is a new helper added alongside this spec (see its own
// comment in ticket-fixtures.ts) so the "GET returns a real messages array"
// assertion is backed by an actual TicketMessage row, not an empty array.
//
// Shared-state isolation: unlike e2e/tickets.spec.ts, nothing here asserts
// on a *global* set of tickets (e.g. "the list contains exactly these rows"
// or "the total count is N") — every assertion below targets one specific,
// uniquely-subjected ticket this file itself created, by id. That means this
// file does NOT need test.describe.configure({ mode: "serial" }): a
// beforeAll-seeded fixture set is safe to read from multiple parallel
// workers, and every test that *mutates* a ticket's status creates its own
// fresh row (via createTicket() below) rather than touching a shared one —
// see the "PATCH ... happy-path transitions" and "UI status-action round
// trip" describes.
let agentId: string;
let otherAgentId: string;

// Read-only fixtures, safe to share across every test that only performs a
// GET or an "expect this PATCH to be rejected before it touches anything"
// check — none of those tests mutate these rows.
let detailTicket: TicketFixture; // status OPEN, assignedTo: agentId, has one message
let detailMessageBody: string;
let scopedOutTicket: TicketFixture; // status OPEN, assignedTo: otherAgentId (not the seeded agent)

test.beforeAll(async () => {
  await withTestDbClient(async (client) => {
    agentId = await getSeededAgentId(client);
    otherAgentId = await createThrowawayAgent(client, {
      email: `e2e-ticket-detail-other-agent-${crypto.randomUUID()}@example.com`,
      name: "Other Detail Agent",
    });

    detailTicket = await insertTicket(client, {
      subject: `E2E Ticket Detail ${crypto.randomUUID()}`,
      customerEmail: `detail-${crypto.randomUUID()}@customer.example`,
      customerName: "Detail Customer",
      gmailThreadId: `e2e-thread-detail-${crypto.randomUUID()}`,
      status: "OPEN",
      assignedToId: agentId,
      createdAt: new Date(),
    });

    detailMessageBody = `Hello from the customer, e2e run ${crypto.randomUUID()}`;
    await insertTicketMessage(client, {
      ticketId: detailTicket.id,
      direction: "INBOUND",
      authorType: "CUSTOMER",
      body: detailMessageBody,
      gmailMessageId: `e2e-msg-detail-${crypto.randomUUID()}`,
    });

    scopedOutTicket = await insertTicket(client, {
      subject: `E2E Ticket Detail Scoped Out ${crypto.randomUUID()}`,
      customerEmail: `scoped-out-${crypto.randomUUID()}@customer.example`,
      customerName: null,
      gmailThreadId: `e2e-thread-detail-scoped-out-${crypto.randomUUID()}`,
      status: "OPEN",
      assignedToId: otherAgentId,
      createdAt: new Date(),
    });
  });
});

// Inserts a fresh, uniquely-subjected ticket owned by no other test — used
// by every test below that actually calls PATCH and needs to observe a real
// status change, so two such tests can never race on the same row.
async function createTicket(
  status: "OPEN" | "RESOLVED" | "CLOSED",
  assignedToId: string | null
): Promise<TicketFixture> {
  return withTestDbClient((client) =>
    insertTicket(client, {
      subject: `E2E Ticket Detail Mutation ${crypto.randomUUID()}`,
      customerEmail: `mutation-${crypto.randomUUID()}@customer.example`,
      customerName: null,
      gmailThreadId: `e2e-thread-detail-mutation-${crypto.randomUUID()}`,
      status,
      assignedToId,
      createdAt: new Date(),
    })
  );
}

test.describe("navigating from the tickets list", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("clicking a ticket's subject lands on its detail page and shows the real ticket data", async ({
    page,
  }) => {
    await page.goto("/tickets");

    await expect(
      page.getByRole("row", { name: new RegExp(detailTicket.subject) })
    ).toBeVisible();

    await page.getByRole("link", { name: detailTicket.subject }).click();

    await expect(page).toHaveURL(`/tickets/${detailTicket.id}`);
    await expect(page.getByRole("heading", { level: 1, name: detailTicket.subject })).toBeVisible();
    // Not a bare getByText("Detail Customer") — this ticket also has one
    // CUSTOMER-authored message (seeded in beforeAll), and
    // TicketConversation's author label for a CUSTOMER message is the same
    // ticket.customerName ("Detail Customer"), so an unscoped match resolves
    // to two elements (the header's "Detail Customer · <email>" <dd> and the
    // message's author-label <span>) and fails Playwright's strict mode. The
    // " · " separator only appears in TicketDetailHeader's composed
    // "name · email" text, so matching that prefix is unique to the header.
    await expect(page.getByText(/Detail Customer ·/)).toBeVisible();
    await expect(page.getByText("OPEN", { exact: true })).toBeVisible();
  });
});

test.describe("GET /api/tickets/[id]", () => {
  test("returns 401 with no session", async ({ request }) => {
    const response = await request.get(`/api/tickets/${detailTicket.id}`);
    expect(response.status()).toBe(401);
  });

  test.describe("as the assigned agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("returns the full ticket detail, including a real messages array", async ({ request }) => {
      const response = await request.get(`/api/tickets/${detailTicket.id}`);
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body).toEqual(
        expect.objectContaining({
          id: detailTicket.id,
          subject: detailTicket.subject,
          status: "OPEN",
          assignedTo: { id: agentId, name: "Agent" },
        })
      );
      expect(Array.isArray(body.messages)).toBe(true);
      expect(body.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            body: detailMessageBody,
            direction: "INBOUND",
            authorType: "CUSTOMER",
          }),
        ])
      );
    });

    test("returns 404 for a ticket assigned to a different agent", async ({ request }) => {
      const response = await request.get(`/api/tickets/${scopedOutTicket.id}`);
      expect(response.status()).toBe(404);
    });

    test("returns 404 for a nonexistent ticket id", async ({ request }) => {
      const response = await request.get(`/api/tickets/${crypto.randomUUID()}`);
      expect(response.status()).toBe(404);
    });
  });

  test.describe("as an admin", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test("returns the ticket regardless of assignment", async ({ request }) => {
      const response = await request.get(`/api/tickets/${scopedOutTicket.id}`);
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.id).toBe(scopedOutTicket.id);
      expect(body.assignedTo).toEqual({ id: otherAgentId, name: "Other Detail Agent" });
    });
  });
});

test.describe("PATCH /api/tickets/[id]", () => {
  test("returns 401 with no session", async ({ request }) => {
    const response = await request.patch(`/api/tickets/${detailTicket.id}`, {
      data: { status: "RESOLVED" },
    });
    expect(response.status()).toBe(401);
  });

  test.describe("as a scoped-out agent", () => {
    test.use({ storageState: AGENT_STORAGE_STATE });

    test("returns 404 instead of mutating a ticket assigned to a different agent", async ({
      request,
    }) => {
      const response = await request.patch(`/api/tickets/${scopedOutTicket.id}`, {
        data: { status: "RESOLVED" },
      });
      expect(response.status()).toBe(404);
    });
  });

  test.describe("invalid status values", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    // Validated by models/ticket.model.ts's updateTicketStatusSchema before
    // any DB lookup happens (see app/api/tickets/[id]/route.ts's PATCH —
    // .parse() runs ahead of findScopedTicket), so a real ticket id isn't
    // needed for either case: both are rejected before the id is ever used.
    for (const invalidStatus of ["OPEN", "NOT_A_REAL_STATUS"]) {
      test(`returns 400 for status: "${invalidStatus}"`, async ({ request }) => {
        const response = await request.patch(`/api/tickets/${crypto.randomUUID()}`, {
          data: { status: invalidStatus },
        });
        expect(response.status()).toBe(400);
      });
    }
  });

  test.describe("happy-path transitions", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test("OPEN -> RESOLVED is persisted", async ({ request }) => {
      const ticket = await createTicket("OPEN", null);

      const patchResponse = await request.patch(`/api/tickets/${ticket.id}`, {
        data: { status: "RESOLVED" },
      });
      expect(patchResponse.status()).toBe(200);
      expect((await patchResponse.json()).status).toBe("RESOLVED");

      const getResponse = await request.get(`/api/tickets/${ticket.id}`);
      expect((await getResponse.json()).status).toBe("RESOLVED");
    });

    test("OPEN -> CLOSED is persisted", async ({ request }) => {
      const ticket = await createTicket("OPEN", null);

      const patchResponse = await request.patch(`/api/tickets/${ticket.id}`, {
        data: { status: "CLOSED" },
      });
      expect(patchResponse.status()).toBe(200);
      expect((await patchResponse.json()).status).toBe("CLOSED");

      const getResponse = await request.get(`/api/tickets/${ticket.id}`);
      expect((await getResponse.json()).status).toBe("CLOSED");
    });

    test("RESOLVED -> CLOSED is persisted", async ({ request }) => {
      const ticket = await createTicket("RESOLVED", null);

      const patchResponse = await request.patch(`/api/tickets/${ticket.id}`, {
        data: { status: "CLOSED" },
      });
      expect(patchResponse.status()).toBe(200);
      expect((await patchResponse.json()).status).toBe("CLOSED");

      const getResponse = await request.get(`/api/tickets/${ticket.id}`);
      expect((await getResponse.json()).status).toBe("CLOSED");
    });

    // Nested so only this one case authenticates as the agent instead of
    // the describe's admin — proving the *positive* side of PATCH
    // role-scoping (not just the 404-for-someone-else's-ticket case above):
    // an agent successfully transitioning a ticket that's actually theirs.
    test.describe("as the assigned agent", () => {
      test.use({ storageState: AGENT_STORAGE_STATE });

      test("can transition their own ticket, and the change is persisted", async ({ request }) => {
        const ticket = await createTicket("OPEN", agentId);

        const patchResponse = await request.patch(`/api/tickets/${ticket.id}`, {
          data: { status: "RESOLVED" },
        });
        expect(patchResponse.status()).toBe(200);
        expect((await patchResponse.json()).status).toBe("RESOLVED");

        const getResponse = await request.get(`/api/tickets/${ticket.id}`);
        expect((await getResponse.json()).status).toBe("RESOLVED");
      });
    });
  });

  test.describe("illegal transitions", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test("CLOSED -> anything returns 409 and leaves the ticket untouched", async ({ request }) => {
      const ticket = await createTicket("CLOSED", null);

      const response = await request.patch(`/api/tickets/${ticket.id}`, {
        data: { status: "RESOLVED" },
      });
      expect(response.status()).toBe(409);

      const getResponse = await request.get(`/api/tickets/${ticket.id}`);
      expect((await getResponse.json()).status).toBe("CLOSED");
    });
  });
});

test.describe("status-action round trip on the detail page", () => {
  test.use({ storageState: AGENT_STORAGE_STATE });

  test("Mark Resolved updates the visible status and survives a reload", async ({ page }) => {
    const ticket = await createTicket("OPEN", agentId);

    await page.goto(`/tickets/${ticket.id}`);
    await expect(page.getByRole("heading", { level: 1, name: ticket.subject })).toBeVisible();

    await page.getByRole("button", { name: "Mark Resolved" }).click();

    await expect(page.getByText("RESOLVED", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark Resolved" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("RESOLVED", { exact: true })).toBeVisible();
  });

  test("Close, after confirming the dialog, closes the ticket and hides the actions, and survives a reload", async ({
    page,
  }) => {
    const ticket = await createTicket("OPEN", agentId);

    await page.goto(`/tickets/${ticket.id}`);
    await expect(page.getByRole("heading", { level: 1, name: ticket.subject })).toBeVisible();

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Close this ticket?" })).toBeVisible();

    await page.getByRole("button", { name: "Close ticket" }).click();

    await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark Resolved" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  });
});

test.describe("access control", () => {
  test("an unauthenticated visitor is redirected to /login with a callbackUrl back to the ticket", async ({
    page,
  }) => {
    await page.goto(`/tickets/${detailTicket.id}`);

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe(`/tickets/${detailTicket.id}`);
  });
});

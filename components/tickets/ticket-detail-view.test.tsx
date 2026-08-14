import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TicketDetailView } from "@/components/tickets/ticket-detail-view";
import { TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketDetail } from "@/models/ticket.model";

// apiClient is mocked at the module boundary, same pattern as
// tickets-view.test.tsx — TicketDetailView's own network access (via
// hooks/use-ticket.ts and hooks/use-update-ticket-status.ts) goes through
// this, so mocking here exercises the real hooks/React Query wiring instead
// of stubbing them out.
const apiClientMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: apiClientMocks }));

function ticket(overrides: Partial<TicketDetail>): TicketDetail {
  return {
    id: "ticket-1",
    subject: "Can't log in",
    status: TicketStatus.OPEN,
    customerEmail: "customer@example.com",
    customerName: null,
    assignedTo: null,
    resolvedByAi: false,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    resolvedAt: null,
    closedAt: null,
    summary: null,
    category: null,
    sentiment: null,
    messages: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderView(initialTicket: TicketDetail) {
  apiClientMocks.get.mockImplementation(() => Promise.resolve({ data: initialTicket }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TicketDetailView ticketId={initialTicket.id} />
    </QueryClientProvider>
  );
}

// Coverage for TicketDetailView's own orchestration logic: which status
// actions render per ticket.status, the Close confirm-dialog flow, mutation
// error display, the reply box's disabled-until-typed wiring (and that it's
// genuinely unwired to any API call — see that component's own comment),
// and the error state when the ticket fails to load. The header/conversation
// rendering this wraps has its own dedicated tests
// (ticket-detail-header.test.tsx, ticket-conversation.test.tsx); the real
// GET/PATCH /api/tickets/[id] behavior (status codes, persisted transitions,
// role-scoping) needs a real backend and stays in e2e.
describe("TicketDetailView", () => {
  it("shows \"Failed to load ticket.\" when the ticket fails to load", async () => {
    apiClientMocks.get.mockImplementation(() => Promise.reject(new Error("network error")));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TicketDetailView ticketId="ticket-1" />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Failed to load ticket.")).toBeTruthy();
  });

  it("shows both Mark Resolved and Close for an OPEN ticket", async () => {
    renderView(ticket({ status: TicketStatus.OPEN }));

    expect(await screen.findByRole("button", { name: "Mark Resolved" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("shows only Close (no Mark Resolved) for a RESOLVED ticket", async () => {
    renderView(ticket({ status: TicketStatus.RESOLVED }));

    expect(await screen.findByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark Resolved" })).toBeNull();
  });

  it("shows no status actions or reply box for a CLOSED ticket", async () => {
    renderView(ticket({ status: TicketStatus.CLOSED }));

    await screen.findByText(ticket({}).subject);
    expect(screen.queryByRole("button", { name: "Mark Resolved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByLabelText("Reply to customer")).toBeNull();
  });

  it("clicking Mark Resolved PATCHes the ticket to RESOLVED", async () => {
    apiClientMocks.patch.mockImplementation(() =>
      Promise.resolve({ data: ticket({ status: TicketStatus.RESOLVED }) })
    );
    renderView(ticket({ status: TicketStatus.OPEN }));

    fireEvent.click(await screen.findByRole("button", { name: "Mark Resolved" }));

    await waitFor(() =>
      expect(apiClientMocks.patch).toHaveBeenCalledWith("/api/tickets/ticket-1", {
        status: "RESOLVED",
      })
    );
  });

  it("clicking Close opens a confirm dialog, and only PATCHes to CLOSED once confirmed", async () => {
    apiClientMocks.patch.mockImplementation(() =>
      Promise.resolve({ data: ticket({ status: TicketStatus.CLOSED }) })
    );
    renderView(ticket({ status: TicketStatus.OPEN }));

    fireEvent.click(await screen.findByRole("button", { name: "Close" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Close this ticket?" });
    expect(apiClientMocks.patch).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close ticket" }));

    await waitFor(() =>
      expect(apiClientMocks.patch).toHaveBeenCalledWith("/api/tickets/ticket-1", {
        status: "CLOSED",
      })
    );
  });

  it("cancelling the confirm dialog never calls PATCH", async () => {
    renderView(ticket({ status: TicketStatus.OPEN }));

    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Close this ticket?" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(apiClientMocks.patch).not.toHaveBeenCalled();
  });

  it("shows the mutation's error message inline when the status PATCH fails", async () => {
    apiClientMocks.patch.mockImplementation(() => Promise.reject(new Error("Conflict")));
    renderView(ticket({ status: TicketStatus.OPEN }));

    fireEvent.click(await screen.findByRole("button", { name: "Mark Resolved" }));

    expect(await screen.findByText("Conflict")).toBeTruthy();
  });

  describe("reply box (UI-only — not wired up yet)", () => {
    it("disables Send until text is typed, and never calls the API even once enabled", async () => {
      renderView(ticket({ status: TicketStatus.OPEN }));

      const textarea = await screen.findByLabelText("Reply to customer");
      const sendButton = screen.getByRole("button", { name: "Send" });
      expect(sendButton.hasAttribute("disabled")).toBe(true);

      fireEvent.change(textarea, { target: { value: "Thanks for reaching out." } });
      expect(sendButton.hasAttribute("disabled")).toBe(false);

      fireEvent.click(sendButton);
      expect(apiClientMocks.post).not.toHaveBeenCalled();
      expect(apiClientMocks.patch).not.toHaveBeenCalled();
    });

    it("leaves Send disabled for whitespace-only input", async () => {
      renderView(ticket({ status: TicketStatus.OPEN }));

      const textarea = await screen.findByLabelText("Reply to customer");
      fireEvent.change(textarea, { target: { value: "   " } });

      expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
    });
  });
});

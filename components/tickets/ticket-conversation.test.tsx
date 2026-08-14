import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { MessageAuthorType, MessageDirection, TicketStatus } from "@/lib/generated/prisma/enums";
import type { TicketMessageItem } from "@/models/ticket-message.model";
import type { TicketDetail } from "@/models/ticket.model";

afterEach(cleanup);

function message(overrides: Partial<TicketMessageItem>): TicketMessageItem {
  return {
    id: "message-1",
    direction: MessageDirection.INBOUND,
    authorType: MessageAuthorType.CUSTOMER,
    author: null,
    body: "I can't log in.",
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

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

// TicketConversation is pure/presentational — driven entirely by the
// `ticket` prop (message list + the customerName/customerEmail it derives
// the CUSTOMER author label from), no data fetching — so its per-authorType
// label logic and empty state are cheap to cover directly, same rationale
// as tickets-table.test.tsx covering TicketsTable's fallback rules.
describe("TicketConversation", () => {
  it("renders \"No messages yet.\" when the thread is empty", () => {
    render(<TicketConversation ticket={ticket({ messages: [] })} />);

    expect(screen.getByText("No messages yet.")).toBeTruthy();
  });

  it("renders each message's body", () => {
    render(
      <TicketConversation
        ticket={ticket({
          messages: [
            message({ id: "m1", body: "First message" }),
            message({ id: "m2", body: "Second message" }),
          ],
        })}
      />
    );

    expect(screen.getByText("First message")).toBeTruthy();
    expect(screen.getByText("Second message")).toBeTruthy();
  });

  it("labels a CUSTOMER message with the ticket's customerName, when set", () => {
    render(
      <TicketConversation
        ticket={ticket({
          customerName: "Ada Lovelace",
          customerEmail: "ada@example.com",
          messages: [message({ authorType: MessageAuthorType.CUSTOMER })],
        })}
      />
    );

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  });

  it("falls back a CUSTOMER message's label to customerEmail when customerName is null", () => {
    render(
      <TicketConversation
        ticket={ticket({
          customerName: null,
          customerEmail: "anon@example.com",
          messages: [message({ authorType: MessageAuthorType.CUSTOMER })],
        })}
      />
    );

    expect(screen.getByText("anon@example.com")).toBeTruthy();
  });

  it("labels an AGENT message with the author's name, when set", () => {
    render(
      <TicketConversation
        ticket={ticket({
          messages: [
            message({
              authorType: MessageAuthorType.AGENT,
              direction: MessageDirection.OUTBOUND,
              author: { id: "agent-1", name: "Grace Hopper" },
            }),
          ],
        })}
      />
    );

    expect(screen.getByText("Grace Hopper")).toBeTruthy();
  });

  it("falls back an AGENT message's label to \"Agent\" when author is null", () => {
    render(
      <TicketConversation
        ticket={ticket({
          messages: [
            message({
              authorType: MessageAuthorType.AGENT,
              direction: MessageDirection.OUTBOUND,
              author: null,
            }),
          ],
        })}
      />
    );

    expect(screen.getByText("Agent")).toBeTruthy();
  });

  it("labels an AI message \"AI\"", () => {
    render(
      <TicketConversation
        ticket={ticket({
          messages: [
            message({ authorType: MessageAuthorType.AI, direction: MessageDirection.OUTBOUND }),
          ],
        })}
      />
    );

    expect(screen.getByText("AI")).toBeTruthy();
  });

  it("labels a SYSTEM message \"System\"", () => {
    render(
      <TicketConversation
        ticket={ticket({
          messages: [
            message({
              authorType: MessageAuthorType.SYSTEM,
              direction: MessageDirection.OUTBOUND,
            }),
          ],
        })}
      />
    );

    expect(screen.getByText("System")).toBeTruthy();
  });
});

import { MessageAuthorType, MessageDirection } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { TicketMessageItem } from "@/models/ticket-message.model";
import type { TicketDetail } from "@/models/ticket.model";

// This uses the same dateStyle/timeStyle pairing as use-tickets-table.tsx's dateFormatter.
// Recency down to the hour and minute matters for tickets.
//
// This does not import that formatter, since that module does not export it.
// A `new Intl.DateTimeFormat(...)` call is cheap enough that threading it through as a shared export for one extra caller is not worth it.
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function authorLabel(message: TicketMessageItem, customerName: string | null, customerEmail: string) {
  switch (message.authorType) {
    case MessageAuthorType.CUSTOMER:
      return customerName ?? customerEmail;
    case MessageAuthorType.AGENT:
      return message.author?.name ?? "Agent";
    case MessageAuthorType.AI:
      return "AI";
    case MessageAuthorType.SYSTEM:
      return "System";
  }
}

// This is the conversation-thread section of the ticket detail page.
// It is split out of ticket-detail-view.tsx, so message-rendering concerns — author labels, direction-based styling, timestamps — live in their own component, instead of alongside that component's data-fetching and status-action orchestration.
export function TicketConversation({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-muted-foreground">Conversation</h2>
      {ticket.messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {ticket.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-4",
                message.direction === MessageDirection.INBOUND
                  ? "border-transparent bg-muted/50"
                  : "border-border bg-card"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {authorLabel(message, ticket.customerName, ticket.customerEmail)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dateFormatter.format(new Date(message.createdAt))}
                </span>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

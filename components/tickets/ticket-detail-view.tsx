"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/confirm-alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { TicketDetailSkeleton } from "@/components/tickets/ticket-detail-skeleton";
import { useTicket } from "@/hooks/use-ticket";
import { useUpdateTicketStatus } from "@/hooks/use-update-ticket-status";
import { useSendTicketReply } from "@/hooks/use-send-ticket-reply";
import { useRephraseReply } from "@/hooks/use-rephrase-reply";
import { useAssignTicket } from "@/hooks/use-assign-ticket";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useUsers } from "@/hooks/use-users";
import { Role, TicketStatus } from "@/lib/generated/prisma/enums";
import { MAX_REPLY_BODY_LENGTH } from "@/models/ticket.model";

// This owns the ticket query and page-level orchestration for app/(main)/tickets/[id]/page.tsx.
// It decides which sections show, and in what order.
//
// The header (subject, status, customer summary) and the conversation thread are their own components: ticket-detail-header.tsx and ticket-conversation.tsx.
// So this component's job is fetching the ticket and deciding what to render, not also owning their markup.
//
// The reply box and Mark Resolved/Close actions stay here for now.
// See app/api/tickets/[id]/route.ts's ALLOWED_TRANSITIONS for the rules the latter mirrors client-side, just to decide which buttons to show.
// The API route is still the actual enforcement.
// The reply box sends a real outbound email through useSendTicketReply (app/api/tickets/[id]/reply/route.ts, threaded through lib/gmail.ts's sendGmailReply()).
//
// "Rephrase with AI" streams a rewrite of the draft straight into the same replyText state, via useRephraseReply (app/api/tickets/[id]/rephrase/route.ts). It's the one thing here that isn't a TanStack Query mutation — see that hook's own comment for why.
//
// The assign control rendered in the header follows the same pattern.
// This component owns useAssignTicket and the isAdmin/agents it needs. The header just renders what it is handed.
// See app/api/tickets/[id]/assign/route.ts for the actual admin-only, OPEN-only enforcement.
export function TicketDetailView({ ticketId }: { ticketId: string }) {
  const { data: ticket, isLoading, isError } = useTicket(ticketId);
  const updateStatus = useUpdateTicketStatus(ticketId);
  const sendReply = useSendTicketReply(ticketId);
  const rephrase = useRephraseReply(ticketId);
  const assignTicket = useAssignTicket(ticketId);
  const { user } = useCurrentUser();
  const isAdmin = user?.role === Role.ADMIN;
  // Only an Admin ever renders the assign control (see TicketDetailHeader), so agents skip this fetch entirely.
  // See hooks/use-users.ts's `enabled` param comment.
  const { users: agents } = useUsers({ enabled: isAdmin });
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [replyText, setReplyText] = useState("");

  if (isLoading) return <TicketDetailSkeleton />;
  if (isError || !ticket) {
    return <p className="text-sm text-destructive">Failed to load ticket.</p>;
  }

  function handleCloseDialogChange(nextOpen: boolean) {
    setCloseDialogOpen(nextOpen);
    if (!nextOpen) updateStatus.reset();
  }

  function handleResolveDialogChange(nextOpen: boolean) {
    setResolveDialogOpen(nextOpen);
    if (!nextOpen) updateStatus.reset();
  }

  // This uses the same preventDefault-then-manual-close pattern as components/users/delete-user-dialog.tsx's handleDelete.
  // AlertDialogAction auto-closes on click otherwise, before the mutation — and its possible error — has a chance to resolve.
  function handleClose(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    updateStatus.mutate("CLOSED", { onSuccess: () => setCloseDialogOpen(false) });
  }

  function handleResolve(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    updateStatus.mutate("RESOLVED", { onSuccess: () => setResolveDialogOpen(false) });
  }

  return (
    // This is a centered, chat-width column, not full-bleed.
    // A conversation thread stretched edge-to-edge on a wide screen is hard to read.
    //
    // The generous gap-10 between the header, conversation, and actions sections, separated by Separator, gives each its own visual block, instead of the previous flat gap-6 stack.
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <TicketDetailHeader
        ticket={ticket}
        isAdmin={isAdmin}
        agents={agents}
        onAssign={(assignedToId) => assignTicket.mutate(assignedToId)}
        assignPending={assignTicket.isPending}
        assignError={assignTicket.error?.message ?? null}
      />

      <Separator />

      <TicketConversation ticket={ticket} />

      {ticket.status !== TicketStatus.CLOSED && (
        <>
          <Separator />

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Reply</h2>
            <Textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder="Type a reply to the customer…"
              rows={4}
              aria-label="Reply to customer"
              // Same cap the server enforces (models/ticket.model.ts).
              // This just stops the agent from typing/pasting past it in
              // the first place — the server-side check is still what
              // actually matters, since this one's trivially bypassable
              // by anyone calling the API directly.
              maxLength={MAX_REPLY_BODY_LENGTH}
              // Disabled while a rephrase is streaming in, not while
              // sending — sendReply.isPending is a quick request, but
              // disabling the field the agent is looking at mid-send
              // would just flicker for no reason. Streaming, by
              // contrast, overwrites this same field's value on every
              // chunk — editing at the same time would race against
              // that and lose keystrokes.
              disabled={rephrase.isStreaming}
            />
            {(sendReply.error || rephrase.error) && (
              <p role="alert" className="text-sm text-destructive">
                {sendReply.error?.message ?? rephrase.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!replyText.trim() || rephrase.isStreaming || sendReply.isPending}
                onClick={() => rephrase.rephrase(replyText, setReplyText)}
              >
                {rephrase.isStreaming ? "Rephrasing…" : "Rephrase with AI"}
              </Button>
              <Button
                disabled={!replyText.trim() || sendReply.isPending || rephrase.isStreaming}
                onClick={() =>
                  sendReply.mutate(replyText, { onSuccess: () => setReplyText("") })
                }
              >
                {sendReply.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              {ticket.status === TicketStatus.OPEN && (
                <ConfirmAlertDialog
                  open={resolveDialogOpen}
                  onOpenChange={handleResolveDialogChange}
                  trigger={
                    <Button variant="secondary" disabled={updateStatus.isPending}>
                      Mark Resolved
                    </Button>
                  }
                  title="Mark this ticket resolved?"
                  description="The customer gets an automated email saying so. If they reply, this ticket reopens automatically and their reply is treated as a signal of dissatisfaction."
                  error={updateStatus.error?.message}
                  pending={updateStatus.isPending && updateStatus.variables === "RESOLVED"}
                  confirmLabel="Mark ticket resolved"
                  pendingLabel="Marking Resolved…"
                  onConfirm={handleResolve}
                />
              )}

              <ConfirmAlertDialog
                open={closeDialogOpen}
                onOpenChange={handleCloseDialogChange}
                trigger={
                  <Button variant="destructive" disabled={updateStatus.isPending}>
                    Close
                  </Button>
                }
                title="Close this ticket?"
                description="This is permanent — a closed ticket can&rsquo;t be reopened. The customer gets an automated closing email and replies to it won&rsquo;t be monitored."
                error={updateStatus.error?.message}
                pending={updateStatus.isPending && updateStatus.variables === "CLOSED"}
                confirmLabel="Close ticket"
                pendingLabel="Closing…"
                actionVariant="destructive"
                onConfirm={handleClose}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

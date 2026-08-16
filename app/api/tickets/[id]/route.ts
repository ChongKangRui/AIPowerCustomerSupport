import { NextResponse } from "next/server";

import { ConflictError, NotFoundError, UnauthorizedError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { sendGmailReply } from "@/lib/gmail";
import { findScopedTicket } from "@/lib/ticket-access";
import { buildClosedEmailBody, buildResolvedEmailBody } from "@/lib/ticket-lifecycle-emails";
import { TicketStatus, MessageDirection, MessageAuthorType } from "@/lib/generated/prisma/enums";
import { ticketDetailSelect, updateTicketStatusSchema } from "@/models/ticket.model";

// GET /api/tickets/[id] — any authenticated user (Admin or Agent), scoped
// per findScopedTicket (lib/ticket-access.ts, shared with the sibling reply
// route). Returns the full TicketDetail: metadata plus the ordered
// conversation thread, for the detail page
// (components/tickets/ticket-detail-view.tsx).
export const GET = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (_request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;
    const ticket = await findScopedTicket(id, session, ticketDetailSelect);
    if (!ticket) throw new NotFoundError("Ticket not found");

    log.info({ ticketId: id }, "fetched ticket detail");
    return NextResponse.json(ticket);
  }
);

// Status transitions the detail page's Mark Resolved/Close actions are
// allowed to make. CLOSED has no outgoing edges at all — it's terminal (see
// project-scope.md: "cannot be reopened" — not even by an agent). Kept as an
// explicit allow-list (not e.g. "anything but the current status") for the
// same reason app/api/tickets/route.ts's buildOrderBy() is a switch instead
// of a dynamic lookup: the set of legal moves should be structurally
// obvious here, not inferred.
const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

// PATCH /api/tickets/[id] — status-only mutation, same auth/scoping as GET.
// Marking a ticket Resolved or Closed also sends a real, SYSTEM-authored
// email to the customer (see lib/ticket-lifecycle-emails.ts for the copy) —
// same sendGmailReply()/threading pattern as an agent's own reply
// (app/api/tickets/[id]/reply/route.ts), just with authorType: SYSTEM and
// no authorId instead of AGENT. The Gmail send happens *before* the DB
// write: if it throws, the whole request fails and status never changes,
// so a ticket can't end up "closed" or "resolved" in the DB while the
// customer was never actually told (the detail page's updateStatus.error
// alert surfaces that failure back to the agent for a retry).
export const PATCH = withApiHandler<{ params: Promise<{ id: string }> }>(
  async (request, context, log, session) => {
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await context.params;
    const { status: nextStatus } = updateTicketStatusSchema.parse(await request.json());

    // ticketDetailSelect plus gmailThreadId — same extension the sibling
    // reply route makes, for the same reason: sendGmailReply() below needs
    // it to thread the outbound send into the right Gmail conversation.
    const existing = await findScopedTicket(id, session, {
      ...ticketDetailSelect,
      gmailThreadId: true,
    });
    if (!existing) throw new NotFoundError("Ticket not found");

    if (!ALLOWED_TRANSITIONS[existing.status].includes(nextStatus)) {
      throw new ConflictError(`Cannot move a ${existing.status} ticket to ${nextStatus}`);
    }

    // Most recent message in the thread with a real rfcMessageId, used to
    // build In-Reply-To/References — same lookup as the reply route.
    const lastMessage = await prisma.ticketMessage.findFirst({
      where: { ticketId: id, rfcMessageId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { rfcMessageId: true },
    });

    const subject = /^re:/i.test(existing.subject) ? existing.subject : `Re: ${existing.subject}`;
    const bodyText =
      nextStatus === TicketStatus.CLOSED ? buildClosedEmailBody() : buildResolvedEmailBody();

    log.info(
      { ticketId: id, threadId: existing.gmailThreadId, subject, to: nextStatus },
      "sending automated status-change email via Gmail"
    );

    const { gmailMessageId, rfcMessageId } = await sendGmailReply({
      threadId: existing.gmailThreadId,
      to: existing.customerEmail,
      subject,
      bodyText,
      inReplyTo: lastMessage?.rfcMessageId ?? null,
    });

    const [ticket] = await prisma.$transaction([
      prisma.ticket.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(nextStatus === TicketStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
          ...(nextStatus === TicketStatus.CLOSED ? { closedAt: new Date() } : {}),
        },
        select: ticketDetailSelect,
      }),
      prisma.ticketMessage.create({
        data: {
          ticketId: id,
          direction: MessageDirection.OUTBOUND,
          authorType: MessageAuthorType.SYSTEM,
          body: bodyText,
          gmailMessageId,
          rfcMessageId,
          inReplyTo: lastMessage?.rfcMessageId ?? null,
        },
      }),
    ]);

    log.info({ ticketId: id, from: existing.status, to: nextStatus, gmailMessageId }, "updated ticket status");
    return NextResponse.json(ticket);
  }
);

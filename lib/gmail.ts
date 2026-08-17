import { randomUUID } from "node:crypto";

import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { MessageAuthorType, MessageDirection, TicketStatus } from "@/lib/generated/prisma/enums";
import { checkAutoResolve } from "@/lib/ai-auto-resolve";
import { assignNextAgent } from "@/lib/ticket-assignment";
import { buildAiResolvedEmailBody } from "@/lib/ticket-lifecycle-emails";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

// This uses the refresh-token flow, so it needs no redirect URI here.
// The interactive consent screen ran only once, by hand, through the
// OAuth Playground (see implementation-plan.md).
//
// A plain module-level singleton works fine here, unlike lib/prisma.ts's
// globalThis dance. This wraps an HTTP client, not a pooled DB
// connection, so nothing leaks across Next.js dev hot-reloads.
function createGmailClient(): gmail_v1.Gmail {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export const gmail = createGmailClient();

// ---------------------------------------------------------------------------
// EmailSyncState: stores the `historyId` watermark in a single row with id "gmail"
// ---------------------------------------------------------------------------

async function getLastHistoryId(): Promise<string | null> {
  const state = await prisma.emailSyncState.findUnique({ where: { id: "gmail" } });
  return state?.lastHistoryId ?? null;
}

async function updateLastHistoryId(historyId: string): Promise<void> {
  await prisma.emailSyncState.upsert({
    where: { id: "gmail" },
    update: { lastHistoryId: historyId },
    create: { id: "gmail", lastHistoryId: historyId },
  });
}

/**
 * One-time, idempotent sync starting point. Sets the watermark to
 * "everything from now on" instead of resyncing the whole mailbox
 * history. Safe to call on every poll-script run. It does real work
 * only the first time.
 */
export async function bootstrapHistoryId(): Promise<string> {
  const existing = await getLastHistoryId();
  if (existing) {
    logger.info({ historyId: existing }, "Gmail sync already bootstrapped, skipping");
    return existing;
  }

  const profile = await gmail.users.getProfile({ userId: "me" });
  const historyId = profile.data.historyId;
  if (!historyId) throw new Error("Gmail getProfile returned no historyId");

  await updateLastHistoryId(historyId);
  logger.info({ historyId }, "Bootstrapped Gmail historyId");
  return historyId;
}

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

export type ParsedGmailMessage = {
  gmailMessageId: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyText: string;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  /** True when the demo inbox itself sent this message (our own outbound mail), not a customer. */
  isSelfSent: boolean;
};

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string | null {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/** Parses `"Display Name <email@x.com>"`, or a bare `"email@x.com"`. */
function parseFromHeader(raw: string): { email: string; name: string | null } {
  const match = raw.match(/^(.*?)\s*<(.+)>$/);

  if (match) {
    const name = match[1].replace(/^"|"$/g, "").trim();
    return { email: match[2].trim().toLowerCase(), name: name || null };
  }
  return { email: raw.trim().toLowerCase(), name: null };
}

/** Walks the MIME tree and collects every part's decoded body text matching `mimeType`. */
function collectPartsByMimeType(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string
): string[] {
  if (!part) return [];
  const results: string[] = [];
  if (part.mimeType === mimeType && part.body?.data) {
    results.push(Buffer.from(part.body.data, "base64url").toString("utf-8"));
  }
  for (const child of part.parts ?? []) {
    results.push(...collectPartsByMimeType(child, mimeType));
  }
  return results;
}

// Prefers text/plain. If the MIME tree has no plain part anywhere, this
// falls back to the raw text/html markup instead.
//
// Storing raw HTML like that is a known limitation for now. It is fine
// for this slice, but worth a second look once AI starts reading these
// bodies.
function extractBodyText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  const plainParts = collectPartsByMimeType(payload, "text/plain");
  if (plainParts.length > 0) return plainParts.join("\n").trim();

  const htmlParts = collectPartsByMimeType(payload, "text/html");
  return htmlParts.join("\n").trim();
}

// Email clients do not send just the new text in a reply. They
// auto-append everything being replied to underneath, quoted. This
// function strips that quoted history back out. Left unstripped, every
// TicketMessage from here on would re-embed the entire prior
// conversation and grow without bound.
//
// This is a best-effort heuristic, not a full parser. It works well
// enough for common clients but is not guaranteed for every mail
// client's quoting style.
// Exported for lib/gmail.test.ts, since it is pure string-in/string-out
// logic with no Gmail API or DB call involved.
export function stripQuotedReply(bodyText: string): string {
  const lines = bodyText.split(/\r\n|\r|\n/);

  // Case 1: Outlook. Its plain-text quoting has no "> " prefix at all.
  // It uses a literal "-----Original Message-----" marker line instead.
  // Cut there if this function finds that line.
  const originalMessageIndex = lines.findIndex((line) =>
    /^-{2,}\s*original message\s*-{2,}$/i.test(line.trim())
  );
  if (originalMessageIndex !== -1) {
    return lines.slice(0, originalMessageIndex).join("\n").trim() || bodyText.trim();
  }

  // Case 2: everyone else (Gmail, Apple Mail, Yahoo, and more). Each
  // quoted line starts with "> ". A blank line and one localized header
  // line come before it ("On ... wrote:", "... 写道：", "... a écrit :").
  // Rather than list every language, this code keys off what they all
  // share: the header line is the nearest non-blank line above the first
  // "> " line, and it ends in a colon (ASCII or full-width).
  const firstQuoteIndex = lines.findIndex((line) => line.trim().startsWith(">"));

  // Case 3: Gmail can ship a reply with its quoted-history expander left
  // collapsed. Then the header line lands in the plain-text body with no
  // "> " block under it. (A live test against the demo inbox surfaced
  // this: a reply body of just "ok", followed by the bare
  // "<addr> ... wrote:" line, with nothing quoted after it.) This uses
  // the same colon check as case 2, anchored at the end of the message
  // instead of at a quote block. `searchFrom` below does that anchoring
  // when there is no quote block.
  const searchFrom = firstQuoteIndex === -1 ? lines.length : firstQuoteIndex;
  // Skips any blank lines along the way. Gmail's plain-text output
  // always puts at least one blank line between the header and what
  // follows it.
  let headerIndex = searchFrom - 1;
  while (headerIndex >= 0 && lines[headerIndex].trim() === "") headerIndex--;
  const isHeaderLine = headerIndex >= 0 && /[:：]$/.test(lines[headerIndex].trim());

  // Falls back to the untouched body if none of the cases above matched,
  // or if stripping would leave nothing behind. This function never
  // returns an empty message body.
  let cutoff: number;
  if (isHeaderLine) {
    cutoff = headerIndex;
  } else if (firstQuoteIndex !== -1) {
    cutoff = firstQuoteIndex;
  } else {
    return bodyText.trim();
  }

  return lines.slice(0, cutoff).join("\n").trim() || bodyText.trim();
}

export function parseGmailMessage(message: gmail_v1.Schema$Message): ParsedGmailMessage {
  const headers = message.payload?.headers ?? [];
  const fromRaw = getHeader(headers, "From") ?? "";
  const { email: fromEmail, name: fromName } = parseFromHeader(fromRaw);
  const gmailUser = (process.env.GMAIL_USER ?? "").toLowerCase();

  return {
    gmailMessageId: message.id!,
    threadId: message.threadId!,
    fromEmail,
    fromName,
    subject: getHeader(headers, "Subject") ?? "(no subject)",
    bodyText: stripQuotedReply(extractBodyText(message.payload)),
    rfcMessageId: getHeader(headers, "Message-Id") ?? getHeader(headers, "Message-ID"),
    inReplyTo: getHeader(headers, "In-Reply-To"),
    isSelfSent: (message.labelIds ?? []).includes("SENT") || fromEmail === gmailUser,
  };
}

// ---------------------------------------------------------------------------
// Poll + create/append tickets
// ---------------------------------------------------------------------------

export type PollStats = {
  processed: number;
  ticketsCreated: number;
  messagesAppended: number;
  skippedSelfSent: number;
  /** The history referenced a message that is now gone (deleted, Chat label, etc). */
  skippedNotFound: number;
  /** A customer replied to a RESOLVED ticket. The ticket reopened to OPEN (see project-scope.md). */
  ticketsReopened: number;
  /** A customer replied to a CLOSED ticket. The reply was dropped silently: no ticket, message, or email. */
  ignoredClosedReplies: number;
  /** Path A: a new ticket's confidence check was confident, so it was auto-replied and marked RESOLVED. */
  aiAutoResolved: number;
  /** Path B: a new ticket wasn't confident, and an eligible agent was found and assigned. */
  escalatedAndAssigned: number;
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Gaxios errors from googleapis are not a typed class we can check with
// `instanceof`. They carry a numeric `code` instead, mirrored on
// `.response.status`.
function isNotFoundError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 404 || code === "404";
}

// Path A / Path B fork for a brand-new ticket (project-scope.md). Only
// runs for newly created tickets, not for a reply that reopens a RESOLVED
// one — a customer who wasn't satisfied with a resolution should reach a
// human next, not the same AI answer again.
//
// A failure anywhere in here (the AI call, the Gmail send, the DB write)
// is caught and logged rather than thrown. The ticket already exists at
// this point, in its safe default state: OPEN and unassigned, exactly
// like every ticket before Phase 4 existed. That's a degraded outcome,
// not a broken one, and it must not abort the rest of this poll batch
// over one ticket's routing failure.
async function routeNewTicket(
  ticketId: string,
  parsed: ParsedGmailMessage,
  stats: PollStats
): Promise<void> {
  try {
    const autoResolve = await checkAutoResolve({ subject: parsed.subject, body: parsed.bodyText });

    // Logged unconditionally, confident or not — this is the one place
    // that shows what Gemini actually decided and why. Without it, a
    // false verdict and a thrown-then-caught error (checkAutoResolve
    // fails open to the same { confident: false, response: "" } shape,
    // see lib/ai-auto-resolve.ts) look identical from the outside.
    logger.info(
      { ticketId, subject: parsed.subject, confident: autoResolve.confident, response: autoResolve.response },
      "Path A confidence check result"
    );

    if (autoResolve.confident) {
      const subject = /^re:/i.test(parsed.subject) ? parsed.subject : `Re: ${parsed.subject}`;
      const bodyText = buildAiResolvedEmailBody(autoResolve.response);

      const { gmailMessageId, rfcMessageId } = await sendGmailReply({
        threadId: parsed.threadId,
        to: parsed.fromEmail,
        subject,
        bodyText,
        inReplyTo: parsed.rfcMessageId,
      });

      await prisma.$transaction([
        prisma.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.RESOLVED, resolvedByAi: true, resolvedAt: new Date() },
        }),
        prisma.ticketMessage.create({
          data: {
            ticketId,
            direction: MessageDirection.OUTBOUND,
            authorType: MessageAuthorType.AI,
            body: bodyText,
            gmailMessageId,
            rfcMessageId,
            inReplyTo: parsed.rfcMessageId,
          },
        }),
      ]);

      stats.aiAutoResolved++;
      logger.info({ ticketId, threadId: parsed.threadId }, "Path A auto-resolved new ticket");
    } else {
      const agentId = await assignNextAgent();

      if (agentId) {
        await prisma.ticket.update({ where: { id: ticketId }, data: { assignedToId: agentId } });
        stats.escalatedAndAssigned++;
        logger.info({ ticketId, agentId }, "Path B escalated and auto-assigned new ticket");
      } else {
        logger.warn({ ticketId }, "Path B escalation found no eligible agent, ticket left unassigned");
      }
      // No notification is sent here. "Notify agent" is a Phase 5 feature
      // (in-app only, per implementation-plan.md) that doesn't exist yet —
      // the agent finds this ticket by checking their queue, same as any
      // manually assigned one.
    }
  } catch (error) {
    // `err`, not `error` — Pino only auto-serializes an Error object
    // (type/message/stack) under the literal key `err`. A plain `error`
    // key JSON.stringifies to `{}`, since Error's message/stack aren't
    // enumerable own properties. lib/api-handler.ts already gets this
    // right; this file didn't, which is why a real failure here would
    // have logged as an empty, undiagnosable object.
    logger.error({ err: error, ticketId }, "Path A/B routing failed for new ticket, left unassigned");
  }
}

async function processMessage(messageId: string, stats: PollStats): Promise<void> {
  // Checks for idempotency first, before it even calls messages.get. A
  // re-poll over an overlapping history window then costs no extra
  // Gmail API call for messages already stored.
  const already = await prisma.ticketMessage.findUnique({ where: { gmailMessageId: messageId } });
  if (already) return;

  let message: gmail_v1.Schema$Message;
  try {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    message = response.data;
  } catch (error) {
    // history.list can reference a messageAdded event for a message
    // that is no longer fetchable by the time this code reaches it.
    // Examples: auto-deleted spam, or Google Chat entries, which also
    // flow through Gmail's history stream but 404 on
    // users.messages.get.
    //
    // Retrying will not fix this — it is permanently unrecoverable. Skip
    // it and keep the batch going, instead of aborting the whole poll
    // over one gone message.
    if (isNotFoundError(error)) {
      stats.skippedNotFound++;
      logger.warn({ messageId }, "Gmail message from history not found, skipped");
      return;
    }
    throw error;
  }

  const parsed = parseGmailMessage(message);
  stats.processed++;

  if (parsed.isSelfSent) {
    stats.skippedSelfSent++;
    return;
  }

  try {
    const existingTicket = await prisma.ticket.findUnique({
      where: { gmailThreadId: parsed.threadId },
    });

    if (existingTicket && existingTicket.status === TicketStatus.CLOSED) {
      // Closed is terminal (see project-scope.md). The agent's Close
      // action already emailed the customer up front that replies are
      // not monitored (see buildClosedEmailBody in
      // lib/ticket-lifecycle-emails.ts and app/api/tickets/[id]/route.ts).
      //
      // A fresh "still closed" bounce on every later reply would just
      // repeat that same notice. So this code drops a later reply on a
      // closed thread: no TicketMessage, no ticket update, no email.
      stats.ignoredClosedReplies++;
      logger.info(
        { threadId: parsed.threadId, ticketId: existingTicket.id },
        "Inbound reply to a closed ticket ignored"
      );
    } else if (existingTicket) {
      const isReopen = existingTicket.status === TicketStatus.RESOLVED;
      const messageCreate = prisma.ticketMessage.create({
        data: {
          ticketId: existingTicket.id,
          direction: MessageDirection.INBOUND,
          authorType: MessageAuthorType.CUSTOMER,
          body: parsed.bodyText,
          gmailMessageId: parsed.gmailMessageId,
          rfcMessageId: parsed.rfcMessageId,
          inReplyTo: parsed.inReplyTo,
        },
      });

      if (isReopen) {
        // The customer replied to a RESOLVED ticket. This reopens it to
        // OPEN (per project-scope.md), in the same transaction as
        // appending their message.
        //
        // resolvedAt is deliberately left untouched — it's a historical
        // fact about when the ticket was first resolved, not "resolved
        // right now".
        //
        // assignedToId: a human-resolved ticket already has an owner,
        // so this keeps them — they'll see it show back up as OPEN in
        // their queue. A Path A (AI-resolved, lib/ai-auto-resolve.ts)
        // ticket never had one, so this runs the same round robin
        // (lib/ticket-assignment.ts) it would have gotten had the
        // confidence check failed instead of succeeding in the first
        // place, rather than leaving it to silently sit unassigned.
        const assignedToId = existingTicket.assignedToId ?? (await assignNextAgent());

        await prisma.$transaction([
          messageCreate,
          prisma.ticket.update({
            where: { id: existingTicket.id },
            data: { status: TicketStatus.OPEN, assignedToId },
          }),
        ]);
        stats.ticketsReopened++;
        logger.info(
          { threadId: parsed.threadId, ticketId: existingTicket.id, assignedToId },
          "Reopened ticket after customer reply to a resolved ticket"
        );
      } else {
        await messageCreate;
      }
      stats.messagesAppended++;
    } else {
      const ticket = await prisma.ticket.create({
        data: {
          subject: parsed.subject,
          customerEmail: parsed.fromEmail,
          customerName: parsed.fromName,
          gmailThreadId: parsed.threadId,
          messages: {
            create: {
              direction: MessageDirection.INBOUND,
              authorType: MessageAuthorType.CUSTOMER,
              body: parsed.bodyText,
              gmailMessageId: parsed.gmailMessageId,
              rfcMessageId: parsed.rfcMessageId,
              inReplyTo: parsed.inReplyTo,
            },
          },
        },
      });
      stats.ticketsCreated++;

      await routeNewTicket(ticket.id, parsed, stats);
    }
  } catch (error) {
    // This is a backstop for a real race between the check above and
    // this insert. Two overlapping polls could both see "not yet
    // processed" or "no ticket yet" for the same thread. This only
    // matters once concurrent cron invocations exist, but costs nothing
    // to guard against now.
    //
    // gmailThreadId (Ticket) and gmailMessageId (TicketMessage) are both
    // @unique. One writer wins, and the other lands here safely.
    if (isUniqueConstraintError(error)) {
      logger.warn(
        { messageId, threadId: parsed.threadId },
        "Duplicate on concurrent poll, skipped"
      );
      return;
    }
    throw error;
  }
}

/**
 * Syncs new inbound mail since the last stored historyId into Ticket and
 * TicketMessage rows. Requires bootstrapHistoryId() to have run at
 * least once. This function never bootstraps itself, so a missing
 * watermark is a real error, not a silent full-mailbox resync.
 */
export async function pollGmailAndCreateTickets(): Promise<PollStats> {
  const startHistoryId = await getLastHistoryId();
  if (!startHistoryId) {
    throw new Error("No stored Gmail historyId — call bootstrapHistoryId() first");
  }

  const stats: PollStats = {
    processed: 0,
    ticketsCreated: 0,
    messagesAppended: 0,
    skippedSelfSent: 0,
    skippedNotFound: 0,
    ticketsReopened: 0,
    ignoredClosedReplies: 0,
    aiAutoResolved: 0,
    escalatedAndAssigned: 0,
  };

  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
      pageToken,
    });

    const addedMessageIds = new Set(
      (response.data.history ?? [])
        .flatMap((h) => h.messagesAdded ?? [])
        .map((m) => m.message?.id)
        .filter((id): id is string => Boolean(id))
    );


    for (const messageId of addedMessageIds) {
      await processMessage(messageId, stats);
    }

    if (response.data.historyId) latestHistoryId = response.data.historyId;
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Advances the watermark only after everything above succeeds. If
  // this poll throws partway through, the next run safely re-covers the
  // same window. Already-stored messages are cheap no-ops, through the
  // idempotency check in processMessage().
  await updateLastHistoryId(latestHistoryId);

  logger.info({ ...stats, latestHistoryId }, "Gmail poll complete");
  return stats;
}

// ---------------------------------------------------------------------------
// Send
//
// Sends outbound replies, threaded through Gmail's own threadId plus the
// standard In-Reply-To/References headers. Most mail clients also use
// those headers to display threading.
// ---------------------------------------------------------------------------

// This is a pure send. It takes everything it needs as arguments and
// returns what the caller needs to persist. It makes no DB call here,
// the same split as parseGmailMessage (pure parse) versus processMessage
// (parse and DB) above.
//
// The caller, app/api/tickets/[id]/reply/route.ts, reads the
// ticket/thread state beforehand and writes the resulting TicketMessage
// afterward.
export async function sendGmailReply({
  threadId,
  to,
  subject,
  bodyText,
  inReplyTo,
}: {
  threadId: string;
  to: string;
  subject: string;
  bodyText: string;
  /** rfcMessageId of the most recent message in the thread, if any. */
  inReplyTo: string | null;
}): Promise<{ gmailMessageId: string; rfcMessageId: string }> {
  const gmailUser = process.env.GMAIL_USER ?? "";
  // Gmail's send response returns only its own message id, not the
  // Message-ID header value this code set. So this code generates and
  // tracks that value itself, the same way any outbound MTA would.
  const domain = gmailUser.split("@")[1] ?? "localhost";
  const rfcMessageId = `<${randomUUID()}@${domain}>`;

  const headers = [
    `To: ${to}`,
    `From: ${gmailUser}`,
    `Subject: ${subject}`,
    `Message-ID: ${rfcMessageId}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    // In-Reply-To and References both point at only the single most
    // recent message in the thread, not a full accumulated chain. This
    // is a known simplification for now, in the same spirit as
    // extractBodyText's text/html fallback above, since TicketMessage
    // does not track a References list.
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
  ];
  const raw = `${headers.join("\r\n")}\r\n\r\n${bodyText}`;

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: Buffer.from(raw).toString("base64url"),
      threadId,
    },
  });

  const gmailMessageId = response.data.id;
  if (!gmailMessageId) throw new Error("Gmail messages.send returned no message id");

  // Gmail can rewrite a self-supplied Message-ID header on send. It
  // replaces the header when it dislikes the format, and files the
  // original away under X-Google-Original-Message-ID instead.
  //
  // If that happens, and this code kept trusting the id it generated
  // above, every later reply's In-Reply-To/References would point at a
  // Message-ID Gmail never used. That would silently break threading for
  // the rest of the conversation.
  //
  // So instead, this code re-fetches what Gmail actually stored and uses
  // that. It falls back to the generated id only if the header is
  // missing for some reason.
  const sent = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "metadata",
    metadataHeaders: ["Message-Id"],
  });
  const actualRfcMessageId =
    sent.data.payload?.headers?.find((h) => h.name?.toLowerCase() === "message-id")?.value ??
    rfcMessageId;

  logger.info(
    { gmailMessageId, threadId, rfcMessageId: actualRfcMessageId },
    "Sent Gmail reply"
  );
  return { gmailMessageId, rfcMessageId: actualRfcMessageId };
}

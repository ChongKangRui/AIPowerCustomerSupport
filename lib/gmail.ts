import { randomUUID } from "node:crypto";

import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { MessageAuthorType, MessageDirection, TicketStatus } from "@/lib/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

// Refresh-token flow only (no interactive consent screen at runtime — that
// already happened once, manually, via the OAuth Playground per
// implementation-plan.md), so no redirect URI is needed here. A plain
// module-level singleton is fine, unlike lib/prisma.ts's globalThis dance —
// this wraps an HTTP client, not a pooled DB connection, so there's nothing
// to leak across Next.js dev hot-reloads.
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
// EmailSyncState — stored `historyId` watermark (single row, id "gmail")
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
 * One-time (idempotent) sync starting point. Establishes "everything from
 * now on" rather than resyncing the whole mailbox history — safe to call on
 * every poll-script run, only does work the first time.
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
  /** Sent by the demo inbox itself (our own outbound mail), not a customer. */
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

/** Recursively collects every part's decoded body text matching `mimeType`. */
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

// Prefers text/plain; falls back to raw text/html markup if no plain part
// exists anywhere in the MIME tree. Storing raw HTML is a known limitation
// for now (fine for this slice — worth revisiting once AI reads bodies).
function extractBodyText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  const plainParts = collectPartsByMimeType(payload, "text/plain");
  if (plainParts.length > 0) return plainParts.join("\n").trim();

  const htmlParts = collectPartsByMimeType(payload, "text/html");
  return htmlParts.join("\n").trim();
}

// A reply from an email client (Gmail, Outlook, Apple Mail, ...) doesn't
// contain just the new text — the client auto-appends everything it's
// replying to underneath, quoted. Left unstripped, that means every
// TicketMessage body from here on would re-embed the *entire* prior
// conversation, growing without bound (and, concretely, the reopen-on-reply
// flow in processMessage() below would show our own "ticket marked
// resolved" email quoted back inside the customer's own reply). This is a
// best-effort heuristic, not a full parser — good enough for the common
// clients, not guaranteed for every possible mail client's quoting style:
//
// 1. Outlook's plain-text quoting has no "> " prefix at all, just a literal
//    "-----Original Message-----" marker line — cut there if found.
// 2. Everyone else (Gmail, Apple Mail, Yahoo, ...) prefixes each quoted
//    line with "> ", preceded by a *blank* line and then one localized
//    header line ("On ... wrote:", "... 写道：", "... a écrit :"). Rather
//    than enumerate every language, this keys off what they all share: it's
//    the nearest non-blank line above the first "> " line, and it ends in a
//    colon (ASCII or full-width).
// 3. Gmail can also ship a reply with its quoted-history expander left
//    collapsed — the header line makes it into the plain-text body with no
//    "> " block under it at all (this is what a live test against the demo
//    inbox surfaced: a reply body of just "ok" followed by the bare "<addr>
//    ... wrote:" line, nothing quoted after it). Same colon check, just
//    anchored at the end of the message instead of at a quote block.
// Falls back to the untouched body if none of this is found, or if
// stripping would leave nothing behind (a reply that's 100% quote with no
// header line we can identify) — never return an empty message body.
// Exported for lib/gmail.test.ts — pure string-in/string-out logic, no
// Gmail API or DB involved, so it's unit-testable directly rather than only
// indirectly through parseGmailMessage().
export function stripQuotedReply(bodyText: string): string {
  const lines = bodyText.split(/\r\n|\r|\n/);

  const originalMessageIndex = lines.findIndex((line) =>
    /^-{2,}\s*original message\s*-{2,}$/i.test(line.trim())
  );
  if (originalMessageIndex !== -1) {
    return lines.slice(0, originalMessageIndex).join("\n").trim() || bodyText.trim();
  }

  const firstQuoteIndex = lines.findIndex((line) => line.trim().startsWith(">"));
  // Search for a colon-terminated header line backward from the first "> "
  // line, or — if there's no quote block at all — from the very end of the
  // message, skipping any blank lines in between (Gmail's plain-text output
  // always puts at least one blank line between the header and what
  // follows it).
  const searchFrom = firstQuoteIndex === -1 ? lines.length : firstQuoteIndex;
  let headerIndex = searchFrom - 1;
  while (headerIndex >= 0 && lines[headerIndex].trim() === "") headerIndex--;
  const isHeaderLine = headerIndex >= 0 && /[:：]$/.test(lines[headerIndex].trim());

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
  /** History referenced a message that's since gone (deleted, Chat label, etc). */
  skippedNotFound: number;
  /** Customer replied to a RESOLVED ticket — reopened to OPEN (see project-scope.md). */
  ticketsReopened: number;
  /** Customer replied to a CLOSED ticket — dropped silently, no ticket/message/email. */
  ignoredClosedReplies: number;
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Gaxios errors from googleapis carry a numeric `code` (and mirror it on
// `.response.status`) rather than being a typed class we can `instanceof`.
function isNotFoundError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 404 || code === "404";
}

async function processMessage(messageId: string, stats: PollStats): Promise<void> {
  // Idempotency check first — before even calling messages.get, so a
  // re-poll over an overlapping history window doesn't cost an extra Gmail
  // API call for messages already stored.
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
    // history.list can reference a messageAdded event for a message that's
    // no longer fetchable by the time we get to it — e.g. auto-deleted
    // spam, or Google Chat's own entries which also flow through Gmail's
    // history stream but 404 on users.messages.get. Permanently
    // unrecoverable (retrying won't help), so skip it and keep the batch
    // going rather than aborting the whole poll over one gone message.
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
      // Closed is terminal (project-scope.md) — and the agent's Close
      // action already emailed the customer up front that replies aren't
      // monitored (see lib/ticket-lifecycle-emails.ts's buildClosedEmailBody
      // and app/api/tickets/[id]/route.ts). Sending a fresh "still closed"
      // bounce on every subsequent reply would just repeat that same
      // notice, so a later reply on a closed thread is simply dropped: no
      // TicketMessage, no ticket touched, no email.
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
        // Customer replied to a RESOLVED ticket — reopen to OPEN per
        // project-scope.md, atomically with appending their message.
        // Leaves assignedToId/resolvedAt untouched: no round-robin/
        // notification system exists yet (Phase 4/5), so keeping the
        // previous assignee is the lightest "route to a human" available
        // now — it just shows back up as OPEN in their queue.
        await prisma.$transaction([
          messageCreate,
          prisma.ticket.update({
            where: { id: existingTicket.id },
            data: { status: TicketStatus.OPEN },
          }),
        ]);
        stats.ticketsReopened++;
        logger.info(
          { threadId: parsed.threadId, ticketId: existingTicket.id },
          "Reopened ticket after customer reply to a resolved ticket"
        );
      } else {
        await messageCreate;
      }
      stats.messagesAppended++;
    } else {
      await prisma.ticket.create({
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
    }
  } catch (error) {
    // Backstop for a genuine race between the check above and this insert
    // (two overlapping polls both seeing "not yet processed"/"no ticket
    // yet" for the same thread) — only matters once concurrent cron
    // invocations exist, costs nothing to guard against now. gmailThreadId
    // (Ticket) and gmailMessageId (TicketMessage) are both @unique, so one
    // writer wins and the other lands here safely.
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
 * Syncs new inbound mail since the last stored historyId into Ticket /
 * TicketMessage rows. Requires bootstrapHistoryId() to have run at least
 * once — this never bootstraps itself, so a missing watermark is a real
 * error rather than a silent full-mailbox resync.
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

  // Only advance the watermark once everything above succeeded — if this
  // poll throws partway through, the next run safely re-covers the same
  // window (already-stored messages are cheap no-ops via the idempotency
  // check in processMessage).
  await updateLastHistoryId(latestHistoryId);

  logger.info({ ...stats, latestHistoryId }, "Gmail poll complete");
  return stats;
}

// ---------------------------------------------------------------------------
// Send — outbound replies, threaded via Gmail's own threadId plus the
// standard In-Reply-To/References headers most clients also key threading
// display off of.
// ---------------------------------------------------------------------------

// Pure send: takes everything it needs as arguments and hands back what the
// caller needs to persist. No DB access here — same split as
// parseGmailMessage (pure parse) vs processMessage (parse + DB) above; the
// caller (app/api/tickets/[id]/reply/route.ts) is the one that reads the
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
  // Gmail's send response only hands back its own message id, not the
  // Message-ID header value we put in — so we generate and keep track of
  // that ourselves, same way any outbound MTA would.
  const domain = gmailUser.split("@")[1] ?? "localhost";
  const rfcMessageId = `<${randomUUID()}@${domain}>`;

  const headers = [
    `To: ${to}`,
    `From: ${gmailUser}`,
    `Subject: ${subject}`,
    `Message-ID: ${rfcMessageId}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    // In-Reply-To/References are both set to just the single most recent
    // message in the thread, not a fully accumulated chain — a known
    // simplification for now (same spirit as extractBodyText's text/html
    // fallback above), since TicketMessage doesn't track a References list.
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

  // Gmail can rewrite a self-supplied Message-ID header on send (it's known
  // to replace it if it doesn't like the format, filing the original away
  // under X-Google-Original-Message-ID instead) — if that happens and we
  // kept trusting the id we generated above, every later reply's
  // In-Reply-To/References would point at a Message-ID Gmail never actually
  // used, silently breaking threading for the rest of the conversation. So
  // re-fetch what Gmail actually stored and use that instead, falling back
  // to our generated id only if the header is missing for some reason.
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

import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { MessageAuthorType, MessageDirection } from "@/lib/generated/prisma/enums";

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
// TEMP DEBUG LOGGING — everything in this block, plus its call sites (also
// marked "TEMP DEBUG" below), exists purely so you can see what Gmail
// actually sends back while you're learning the shape of the API. Delete
// this whole block and its call sites once you're done exploring — search
// this file for "TEMP DEBUG" to find every piece.
// ---------------------------------------------------------------------------

function debugLogHeaders(headers: gmail_v1.Schema$MessagePartHeader[]): void {
  console.log("--- Headers ---");
  for (const h of headers) {
    console.log(`  ${h.name}: ${h.value}`);
  }
}

// Prints the MIME "part" tree Gmail returns for a message body. A message
// isn't one flat body string — it's a tree of parts. Common shapes:
//   - a simple message: one part, mimeType "text/plain" (or "text/html")
//   - a normal email client's message: "multipart/alternative" wrapping two
//     children — "text/plain" and "text/html" versions of the SAME content
//   - a message with attachments: "multipart/mixed" wrapping the above
//     alternative pair PLUS one child per attachment (mimeType like
//     "image/png", each with a "filename")
// Each part's actual content lives at part.body.data, base64url-encoded —
// that's why decoding is needed before you can read it as normal text.
function debugLogMimeTree(part: gmail_v1.Schema$MessagePart | undefined, depth = 0): void {
  if (!part) return;
  const indent = "  ".repeat(depth);
  const bodyInfo = part.body?.data
    ? `${part.body.data.length} base64url chars`
    : "no body.data (container part, content is in its children)";
  const filename = part.filename ? ` filename="${part.filename}"` : "";
  console.log(`${indent}- ${part.mimeType ?? "(unknown mimeType)"} [${bodyInfo}]${filename}`);

  if (part.body?.data && (part.mimeType === "text/plain" || part.mimeType === "text/html")) {
    const decoded = Buffer.from(part.body.data, "base64url").toString("utf-8");
    const preview = decoded.slice(0, 200).replace(/\n/g, "\\n");
    console.log(`${indent}  decoded preview: "${preview}${decoded.length > 200 ? "..." : ""}"`);
  }

  for (const child of part.parts ?? []) {
    debugLogMimeTree(child, depth + 1);
  }
}
// --- end TEMP DEBUG helpers ---

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
    bodyText: extractBodyText(message.payload),
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

  // TEMP DEBUG — the raw shape of one Gmail message: its metadata, its
  // headers, and its MIME part tree (see debugLogMimeTree's comment above
  // for what that tree means). Remove this block once you're done exploring.
  console.log(`\n${"=".repeat(70)}\nMessage ${message.id}\n${"=".repeat(70)}`);
  console.log("threadId:", message.threadId);
  console.log("labelIds:", message.labelIds);
  console.log("snippet (Gmail's own short preview):", message.snippet);
  debugLogHeaders(message.payload?.headers ?? []);
  console.log("--- MIME part tree ---");
  debugLogMimeTree(message.payload);
  // --- end TEMP DEBUG ---

  const parsed = parseGmailMessage(message);
  stats.processed++;

  // TEMP DEBUG — what our own parser extracted from all of the above.
  console.log("--- Parsed result (what we actually store) ---");
  console.log(parsed);
  // --- end TEMP DEBUG ---

  if (parsed.isSelfSent) {
    stats.skippedSelfSent++;
    return;
  }

  try {
    const existingTicket = await prisma.ticket.findUnique({
      where: { gmailThreadId: parsed.threadId },
    });

    if (existingTicket) {
      await prisma.ticketMessage.create({
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

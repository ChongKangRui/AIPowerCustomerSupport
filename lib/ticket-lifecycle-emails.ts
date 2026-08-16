// Plain-text bodies for the two automated, SYSTEM-authored emails sent from
// app/api/tickets/[id]/route.ts's PATCH handler when an agent marks a
// ticket Resolved or Closed. Kept as small named builders (not inline
// strings at the call site) so the copy has one home and is reusable from
// tests later. Both are sent via the same lib/gmail.ts sendGmailReply() the
// agent-authored reply route already uses — see that route's comment for
// the threading (`inReplyTo`) pattern these follow.

// Sent once, at Close time. Deliberately does NOT get resent on a later
// reply to the same closed thread — lib/gmail.ts's processMessage() ignores
// inbound mail on a CLOSED ticket entirely, silently, rather than bouncing
// this same notice again on every follow-up reply.
export function buildClosedEmailBody(): string {
  return [
    "This ticket has been closed.",
    "",
    "This is an automated message — replies to this email will not be monitored or added to your ticket. If you need further help, please submit a new request.",
  ].join("\n");
}

// Sent once, at Resolve time. The "replying reopens this" line is a real
// promise, not just copy — lib/gmail.ts's processMessage() actually does
// reopen a RESOLVED ticket back to OPEN on the next inbound reply.
export function buildResolvedEmailBody(): string {
  return [
    "This ticket has been marked resolved.",
    "",
    "If you're satisfied, no action is needed. If you reply to this email, your ticket will automatically reopen and your reply will be treated as a signal that the resolution didn't fully address your issue.",
  ].join("\n");
}

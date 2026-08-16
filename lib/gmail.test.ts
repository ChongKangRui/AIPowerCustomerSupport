import { describe, it, expect } from "vitest";

import { stripQuotedReply } from "@/lib/gmail";

// Regression coverage for the two 2026-08-16 error-log.txt entries: a reply
// from any mail client carries the message it's replying to underneath,
// quoted — left unstripped, every TicketMessage body would re-embed the
// whole prior conversation. See stripQuotedReply()'s own comment in
// lib/gmail.ts for the heuristic; these tests exercise it against real
// captured Gmail output (not just synthetic strings), since that's exactly
// what the first pass at this function got wrong.
describe("stripQuotedReply", () => {
  it("strips a full Gmail-style quote (header blank-line-separated from the '> ' block)", () => {
    // Verbatim body captured from the demo inbox, \r\n line endings as
    // Gmail actually sends them. This exact shape is what broke the first
    // version: it assumed the header sits *directly* above the first "> "
    // line, but Gmail puts a blank line in between, so the colon check
    // never matched and the header leaked through unstripped.
    const body =
      "HElp again.\r\n\r\n\r\n<customersupporttest4@gmail.com> at 2026-8-16 10:33wroten：\r\n\r\n" +
      "> This ticket has been marked resolved.\r\n>\r\n" +
      "> If you're satisfied, no action is needed. If you reply to this email,\r\n" +
      "> your ticket will automatically reopen and your reply will be treated\r\n" +
      "> as a signal that the resolution didn't fully address your issue.\r\n>";

    expect(stripQuotedReply(body)).toBe("HElp again.");
  });

  it("strips a header line with no quoted block under it (Gmail's collapsed-quote case)", () => {
    // Also captured verbatim from the demo inbox — the customer's mail
    // client left its quoted-history expander collapsed, so only the bare
    // attribution line made it into the plain-text body, no "> " lines at
    // all. The first version only ever looked for a header *above* a quote
    // block, so a body shaped like this sailed through completely untouched.
    const body = "ok\n\n<customersupporttest4@gmail.com> 于2026年8月16日周日 10:42写道：";

    expect(stripQuotedReply(body)).toBe("ok");
  });

  it("strips an Outlook-style '-----Original Message-----' block", () => {
    const body =
      "Sounds good, thanks!\n\n" +
      "-----Original Message-----\n" +
      "From: Support <support@example.com>\n" +
      "Sent: Sunday, August 16, 2026 10:33 AM\n" +
      "To: Customer <customer@example.com>\n" +
      "Subject: Re: Ticket resolved\n\n" +
      "This ticket has been marked resolved.";

    expect(stripQuotedReply(body)).toBe("Sounds good, thanks!");
  });

  it("strips an English 'On ... wrote:' header the same way", () => {
    const body =
      "Thanks, that's all I needed.\n\n" +
      "On Sun, Aug 16, 2026 at 10:33 AM Support <support@example.com> wrote:\n" +
      "> This ticket has been marked resolved.";

    expect(stripQuotedReply(body)).toBe("Thanks, that's all I needed.");
  });

  it("leaves a plain reply with no quoted content untouched", () => {
    const body = "Just a normal message, nothing quoted here.";

    expect(stripQuotedReply(body)).toBe(body);
  });

  it("trims surrounding whitespace even when there's nothing to strip", () => {
    expect(stripQuotedReply("  hello there  \n\n")).toBe("hello there");
  });

  it("falls back to the untouched body rather than returning an empty string", () => {
    // The whole message is the quote itself — no real content precedes the
    // header line, so stripping would leave nothing behind. Keeping the
    // (admittedly quoted-looking) body is better than storing an empty
    // TicketMessage.
    const body = "On Sun, Aug 16, 2026 at 10:33 AM Support <support@example.com> wrote:\n> hi";

    expect(stripQuotedReply(body)).toBe(body);
  });

  it("known tradeoff: a reply whose own last line happens to end in a colon gets cut too", () => {
    // Documented limitation, not a regression — the heuristic can't tell
    // "this colon ends a genuine sentence" from "this colon ends a
    // quote-attribution line" by punctuation alone. Encoded here so a
    // future change to the heuristic is noticed if it happens to affect
    // this case, rather than silently changing behavior unremarked.
    const body = "Thanks for the help.\n\nOne more question:";

    expect(stripQuotedReply(body)).toBe("Thanks for the help.");
  });
});

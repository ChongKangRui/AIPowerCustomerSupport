"use client";

import { useEffect } from "react";

import { useSyncGmail } from "@/hooks/use-sync-gmail";

// 60s. This is what actually keeps an open session's inbox live —
// the external cron (tech-stack.md's Email section) still runs too, but
// only as a backstop for when nobody has the app open at all, so it's
// been slowed down to a much longer interval on the cron-job.org side.
const GMAIL_AUTO_SYNC_INTERVAL_MS = 60_000;

// Renders nothing. This component exists purely to call useSyncGmail on a
// timer for as long as it's mounted — same "no push infra" polling this
// codebase already uses for notifications (hooks/use-notifications.ts),
// just driving a mutation instead of a query, since a poll has side
// effects (it can create or update tickets), not a plain read.
//
// Mounted once from Navbar (components/navbar.tsx), which sits on every
// logged-in page. So this keeps polling no matter which page is open,
// not just the tickets list — the "Fetch Gmail" button there stays as a
// manual, instant top-up on top of whatever this timer already covers.
//
// Safe to run alongside the cron and the manual button: pollGmailAndCreateTickets()
// tracks progress via a stored `historyId` (tech-stack.md, "historyId persistence"),
// so overlapping triggers can't reprocess or miss a message.
export function GmailAutoSync() {
  const { mutate } = useSyncGmail();

  useEffect(() => {
    mutate();
    const id = setInterval(mutate, GMAIL_AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
    // mutate's identity is stable across renders (TanStack Query), so this
    // effect only ever runs once per mount — not once per render.
  }, [mutate]);

  return null;
}

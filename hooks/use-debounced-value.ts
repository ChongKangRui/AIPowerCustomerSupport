"use client";

import { useEffect, useState } from "react";

// Generic debounce: returns `value`, but delayed until `delayMs` has passed
// with no further changes. Every change to `value` restarts the window —
// the effect's cleanup clears the pending timeout before scheduling a new
// one, so rapid typing keeps pushing the commit out rather than firing once
// per keystroke.
//
// First consumer: components/tickets/tickets-view.tsx's subject search
// input — GET /api/tickets is a real network round trip per query, unlike
// Users' in-memory filterUsers() (components/users/filter-users.ts), which
// has no debounce because it never leaves the client.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

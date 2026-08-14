@AGENTS.md

# Project state

Progress and stack decisions are tracked in the repo, not here — check
`implementation-plan.md` (phase checklist, what's actually built) and
`tech-stack.md` (stack/architecture decisions) for current state before
assuming something is or isn't done. `project-scope.md` has the product
decisions. Update those files (not this one) when a feature lands.

# Testing

Whenever a Playwright e2e test needs to be written or extended, delegate to
the `e2e-test-writer` subagent rather than writing the spec directly — it
knows this repo's selector conventions, auth/storageState pattern, and the
shared-test-DB parallelism gotcha. See `.claude/agents/e2e-test-writer.md`.

**Use e2e only when necessary.** Reserve Playwright specs for behavior that
genuinely needs a real browser + server + DB to mean anything: auth round
trips, persisted/server-verified state (e.g. "the password hash actually
didn't change"), redirects, multi-context session behavior, and
access-control status codes. Push everything else down the pyramid instead:

- Pure logic (validation schemas, filter/sort functions, redirect-target
  guards) → a co-located Vitest `*.test.ts` unit test.
- Client-side/presentational behavior that doesn't need a real backend to be
  meaningful (form validation wiring, pre-fill, conditional rendering,
  search/filter UI wiring) → a co-located `*.test.tsx` React Testing Library
  component test (mock `apiClient`/`next/navigation`, wrap in a fresh
  `QueryClient` — see any existing `*.test.tsx` file for the pattern).

Before adding to or extending an e2e spec, check whether the behavior is
better proven at one of those cheaper layers first — and when trimming or
reviewing existing e2e coverage, look for tests that duplicate what a unit/
component test already proves faster and move them down instead of just
leaving both.

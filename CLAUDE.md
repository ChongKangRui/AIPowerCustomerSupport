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

# Comments

This codebase treats comments as primary documentation — other docs in this
repo (tech-stack.md, implementation-plan.md) point readers *into* the code
for design rationale rather than repeating it. Keep that content, but write
it so a human can actually skim it:

- **One idea per line or short paragraph.** If a comment covers several
  facts (why + a comparison to another file + an edge case + a
  cross-reference), give each fact its own line or short sentence instead
  of one run-on block.
- **Conversational tone.** Write like explaining to a teammate over their
  shoulder — plain sentences, not telegraphic clauses chained together with
  em dashes.
- **Why over what.** The code already shows what it does; a comment's job
  is the reasoning, tradeoff, or gotcha the code can't express on its own.
- **Keep cross-references and rationale** — reformat and split them, don't
  delete them.
- **Short blocks over long paragraphs.** If a comment needs several
  sentences, prefer several short lines/paragraphs over one dense block —
  easier to skim, easier to stop reading once you've found the part you
  needed.
- **Put a comment next to the specific code it explains, not in one shared
  block above several things.** A reader hits the comment before they can
  see the code it's about, so a block that front-loads facts about two
  different declarations (e.g. two exported consts further down) forces
  them to hold ungrounded context before anything concrete shows up. Split
  it: each declaration gets its own short comment directly above it.
- **Match the comment's depth to the code's actual complexity.** Simple,
  self-explanatory code gets a short comment or none — don't give it the
  same multi-paragraph treatment as a genuinely tricky piece of logic just
  because there's history available to explain. Save the longer treatment
  for where the code actually needs it.

`lib/logger.ts`, `lib/rate-limiter.ts`, and `lib/api-handler.ts` are good
examples of this shape.

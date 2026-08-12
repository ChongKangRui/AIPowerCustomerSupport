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

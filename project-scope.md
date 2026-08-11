## Problem
- Need a place and tool to resolve customer inquiries

- Customer service can't work 24 hours — they have shifts. Also, handling every request manually by a human is inefficient.

- Customer service also needs to write responses in a standard, professional manner and form.

## Solution
- AI response and analysis will be integrated into the product.

- Human customer service will be able to write responses back to customers. The platform will help customer service rephrase their words into a standard, professional response.

- AI will respond to customers automatically when it can resolve the inquiry from a knowledge base.

- If AI is unable to resolve the inquiry, it is escalated to a human customer service agent.

## Scope
- Single company, internal support platform (not multi-tenant SaaS).
- Portfolio demo — favor a lean, demonstrable v1 over exhaustive coverage. Some items below are marked with a fallback if they prove too time-consuming.

## Ticket Lifecycle
- Statuses: **Open → Resolved → Closed**
- `Open`: newly created, unassigned or assigned, awaiting resolution.
- `Resolved`: AI or a human agent has answered. Still reopenable.
  - If the customer replies to a `Resolved` ticket, it automatically reopens to `Open` and routes to a human agent.
  - The closing message sent to the customer must clearly state that replying will reopen the ticket and signals they're not satisfied with the resolution — sets expectations and discourages casual replies.
- `Closed`: a human agent has explicitly ended the ticket. **Permanent/terminal** — cannot be reopened.
  - If the customer replies to a `Closed` ticket, the reply is ignored and an automated bounce is sent back ("this ticket is closed, please submit a new request"). No new ticket is created from that reply. This is the abuse-prevention boundary.

## AI Resolution Flow
Two distinct, separate paths — not a single blended flow:

- **Path A — Full auto-resolve**: AI checks the knowledge base against the inquiry. If it finds a confident match, it replies to the customer directly and the ticket moves to `Resolved`. No human involved.
- **Path B — Human-assisted**: AI can't resolve the inquiry (no confident match in the knowledge base) → ticket is escalated and assigned to a human agent → agent drafts a reply → AI rephrases the draft into a standard, professional tone → agent reviews/sends.

### Knowledge base
- Small, manually curated seed set of FAQ/policy docs (e.g. refund policy, password reset, shipping timelines) — roughly 10–20 entries, used as the retrieval source for Path A.
- Not sourced from historical ticket data for v1.

## Email Ingestion
- Real inbox integration: **Gmail API + polling**, against a dedicated demo Gmail account.
  - OAuth consent screen left in "Testing" mode (only the demo account uses it).
  - Poll on an interval (~30–60s) for new messages — no Pub/Sub/webhook infrastructure needed.
- Attachments are **out of scope** for the demo — text-only email bodies are parsed into tickets.

## Roles & Assignment
- Two roles: **Admin** and **Agent**.
  - Admin: user management, sees all tickets, platform settings.
  - Agent: sees tickets assigned to them (assignment-scoped, not full queue by default).
- Escalated (Path B) tickets are assigned to agents via **auto round-robin**.
- Agents are notified of a new assignment both **in-app** and via **email**.

## Customer Visibility
- Email only — customers interact purely via email in/out. No customer-facing status portal for v1.

## Features
- Receive support emails and create tickets (Gmail API polling)
- AI rephrasing: turn an agent's draft into a standard, professional response (Path B)
- AI ticket summarization (for agent context on ticket detail view)
- AI full auto-resolve without human involvement, when knowledge base match is confident (Path A)
- Ticket list with filtering and sorting (scoped to assigned tickets for agents, all tickets for admin)
- Ticket detail view (conversation thread, AI summary, status, assignment)
- User management (admin only)
- Dashboard to view and manage all tickets
  - Target: charts/metrics — resolution time, AI-resolved vs. human-resolved rate, ticket volume trends
  - Fallback if time-constrained: ticket list + basic counts (open/resolved/closed) with no charts

## Out of Scope (v1)
Explicitly deferred, to keep the demo lean:
- Multi-tenant / multi-organization support
- Channels other than email (chat widget, SMS, social)
- Customer-facing status portal
- Email attachments
- Multi-language support
- Supervisor/team-lead role tier
- SLA timers / due-date tracking
- Compliance/PII retention policies beyond what the underlying stack provides by default
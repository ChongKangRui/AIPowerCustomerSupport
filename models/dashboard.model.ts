// This is the wire shape of GET /api/dashboard/stats.
// hooks/use-dashboard-stats.ts and components/dashboard/* import this plain
// types module, the same reason UserListItem lives in models/user.model.ts
// instead of the route file.
//
// A flat object, not nested groups like { agents: {...}, tickets: {...} }.
// All six numbers are independent, equal-weight counts read once and
// rendered as six stat cards — nesting would just be an extra unwrap on
// both ends for no real structure gained.
//
// avgTicketsPerMonth stays a raw number here. Formatting (e.g. one decimal
// place) is a render-time concern, not part of the wire shape.
export type DashboardStats = {
  activeAgents: number;
  inactiveAgents: number;
  totalResolved: number;
  agentResolved: number;
  aiResolved: number;
  avgTicketsPerMonth: number;
};

// This is the wire shape of GET /api/dashboard/charts — one point per
// calendar month, oldest first, for the three Phase 6 trend charts.
//
// `month` is a stable "YYYY-MM" sort/dedupe key. `label` is the
// already-formatted display string (e.g. "Mar 26") — formatting a month
// name is locale/timezone work, better done once on the server than
// repeated in every chart component that renders this array.
//
// ticketsCreated is bucketed by createdAt (when the ticket arrived).
// Everything else — ticketsResolved/agentResolved/aiResolved/
// avgResolutionHours — is bucketed by resolvedAt (when it got resolved).
// Those two dates can land in different months for the same ticket, so a
// ticket created in March but resolved in April counts toward March's
// volume and April's resolution numbers, not the same month for both.
export type DashboardChartPoint = {
  month: string;
  label: string;
  ticketsCreated: number;
  ticketsResolved: number;
  agentResolved: number;
  aiResolved: number;
  avgResolutionHours: number;
};

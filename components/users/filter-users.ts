import type { Role } from "@/lib/generated/prisma/enums";
import type { UserListItem } from "@/app/api/users/route";

// "ALL" is a UI-only sentinel meaning "no role filter" — not a real Role,
// so it's added alongside the enum rather than being part of it.
export type RoleFilter = "ALL" | Role;

// Client-side search/role filter for the admin Users page (used by
// components/users/users-view.tsx, inside a useMemo there). Pulled out as a
// plain function — rather than left inline in the component — so it's
// testable in isolation without rendering anything.
//
// This runs in memory over the single GET /api/users response rather than
// as query params/a filter-aware query key, deliberately. This table is a
// handful of admin/agent accounts (single-org demo, see project-scope.md) —
// at that scale, filtering in memory is instant and avoids a Zod query
// schema, debounced requests, and TanStack Query cache fragmentation per
// filter combination. Server-side filtering is the right call for a dataset
// that actually grows unbounded — the Tickets list (implementation-plan.md
// Phase 3) is where that's earned, not here.
export function filterUsers(
  users: UserListItem[],
  search: string,
  role: RoleFilter
): UserListItem[] {
  const query = search.trim().toLowerCase();
  return users.filter((user) => {
    const matchesRole = role === "ALL" || user.role === role;
    const matchesSearch =
      query === "" ||
      (user.name ?? "").toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query);
    return matchesRole && matchesSearch;
  });
}

import type { Role } from "@/lib/generated/prisma/enums";
import type { UserListItem } from "@/models/user.model";

// "ALL" means "no role filter". It only exists in the UI.
// It is not a real Role, so it is added alongside the enum, not as part of it.
export type RoleFilter = "ALL" | Role;

// This is the client-side search and role filter for the admin Users page.
// components/users/users-view.tsx uses it inside a useMemo there.
// It is a plain function, not inline in the component, so it can be tested in isolation without rendering anything.
//
// This runs in memory over the single GET /api/users response.
// It deliberately does not use query params or a filter-aware query key.
// This table holds a handful of admin and agent accounts (a single-org demo, see project-scope.md).
// At that scale, filtering in memory is instant.
// It also avoids a Zod query schema, debounced requests, and TanStack Query cache fragmentation per filter combination.
//
// Server-side filtering is the right call for a dataset that actually grows unbounded.
// The Tickets list (implementation-plan.md Phase 3) earns that. This table does not.
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

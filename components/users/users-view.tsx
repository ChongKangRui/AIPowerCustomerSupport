"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useUsers } from "@/hooks/use-users";
import { UsersTable } from "@/components/users/users-table";

type RoleFilter = "ALL" | "ADMIN" | "AGENT";

export function UsersView() {
  const { users, isLoading, isError } = useUsers();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("ALL");

  // Filtering happens client-side over the single GET /api/users response
  // rather than as query params/a filter-aware query key, deliberately.
  // This table is a handful of admin/agent accounts (single-org demo, see
  // project-scope.md) — at that scale, filtering in memory is instant and
  // avoids a Zod query schema, debounced requests, and TanStack Query cache
  // fragmentation per filter combination. Server-side filtering is the
  // right call for a dataset that actually grows unbounded — the Tickets
  // list (implementation-plan.md Phase 3) is where that's earned, not here.
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesRole = role === "ALL" || user.role === role;
      const matchesSearch =
        query === "" ||
        (user.name ?? "").toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);
      return matchesRole && matchesSearch;
    });
  }, [users, search, role]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search users"
          className="max-w-xs"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as RoleFilter)}
          aria-label="Filter by role"
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="ALL">All roles</option>
          <option value="ADMIN">Admin</option>
          <option value="AGENT">Agent</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load users.</p>
      ) : filteredUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {users.length === 0 ? "No users yet." : "No users match your filters."}
        </p>
      ) : (
        <UsersTable users={filteredUsers} />
      )}
    </div>
  );
}

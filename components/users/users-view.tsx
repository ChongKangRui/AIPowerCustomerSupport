"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useUsers } from "@/hooks/use-users";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { filterUsers, type RoleFilter } from "@/components/users/filter-users";
import { UsersTable } from "@/components/users/users-table";
import { UsersTableSkeleton } from "@/components/users/users-table-skeleton";
import { Role } from "@/lib/generated/prisma/enums";

export function UsersView() {
  const { users, isLoading, isError } = useUsers();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("ALL");

  // See filter-users.ts for why this filtering happens client-side, and why
  // it's a standalone function rather than written inline here.
  const filteredUsers = useMemo(
    () => filterUsers(users, search, role),
    [users, search, role]
  );

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
          <option value={Role.ADMIN}>Admin</option>
          <option value={Role.AGENT}>Agent</option>
        </select>
        <CreateUserDialog />
      </div>

      {isLoading ? (
        <UsersTableSkeleton />
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

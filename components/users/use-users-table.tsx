"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import { Role } from "@/lib/generated/prisma/enums";
import type { UserListItem } from "@/models/user.model";

// This has no rowSortingFeature or rowPaginationFeature.
// Unlike Tickets, Users stays client-side search/role-filtered over the full unpaginated list.
// See components/users/filter-users.ts's own comment for why that is a scale-appropriate shortcut for a handful of accounts.
//
// This table instance exists only to share DataTable's rendering shell with TicketsTable.
// It does not add sorting or pagination to Users.
const features = tableFeatures({});

const columnHelper = createColumnHelper<typeof features, UserListItem>();

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function RoleBadge({ role }: { role: UserListItem["role"] }) {
  return <Badge variant={role === Role.ADMIN ? "default" : "secondary"}>{role}</Badge>;
}

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => info.getValue() ?? "—",
    meta: { headerClassName: "w-[25%]", cellClassName: "truncate font-medium" },
  }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: (info) => info.getValue(),
    meta: { headerClassName: "w-[31%]", cellClassName: "truncate text-muted-foreground" },
  }),
  columnHelper.accessor("role", {
    header: "Role",
    cell: (info) => <RoleBadge role={info.getValue()} />,
    meta: { headerClassName: "w-[16%]" },
  }),
  columnHelper.accessor("createdAt", {
    header: "Joined",
    cell: (info) => dateFormatter.format(new Date(info.getValue())),
    meta: { headerClassName: "w-[16%]", cellClassName: "text-muted-foreground" },
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: (info) => {
      const user = info.row.original;
      return (
        <div className="flex justify-end gap-1">
          <EditUserDialog user={user} />
          <DeleteUserDialog user={user} />
        </div>
      );
    },
    meta: { headerClassName: "w-[12%] text-right", cellClassName: "text-right" },
  }),
]);

// This shares DataTable's rendering shell with useTicketsTable. See that file's own comment for the fuller rationale.
// There is no sort or page state to translate here, so this hook is much thinner: just column defs and the users array.
export function useUsersTable({ users }: { users: UserListItem[] }) {
  return useTable(
    { features, columns, data: users },
    (state) => state
  );
}

import { DataTable } from "@/components/ui/data-table";
import { useUsersTable } from "@/components/users/use-users-table";
import type { UserListItem } from "@/models/user.model";

// This is a thin wrapper over the shared DataTable, the same pattern as TicketsTable.
// Column identity, cell rendering, and layout live in use-users-table.ts's column defs.
// This just builds that table instance from the `users` prop — unchanged from before this refactor, so UsersView needs no change — and hands it to the generic renderer shared with Tickets.
export function UsersTable({ users }: { users: UserListItem[] }) {
  const table = useUsersTable({ users });
  return <DataTable table={table} />;
}

import { DataTable } from "@/components/ui/data-table";
import { useUsersTable } from "@/components/users/use-users-table";
import type { UserListItem } from "@/models/user.model";

// Thin wrapper over the shared DataTable, same pattern as TicketsTable —
// column identity/cell rendering/layout live in use-users-table.ts's column
// defs; this just builds that table instance from the `users` prop
// (unchanged from before this refactor, so UsersView doesn't need to
// change) and hands it to the generic renderer shared with Tickets.
export function UsersTable({ users }: { users: UserListItem[] }) {
  const table = useUsersTable({ users });
  return <DataTable table={table} />;
}

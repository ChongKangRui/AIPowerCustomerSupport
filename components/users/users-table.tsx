import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import { Role } from "@/lib/generated/prisma/enums";
import type { UserListItem } from "@/app/api/users/route";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function RoleBadge({ role }: { role: UserListItem["role"] }) {
  return (
    <Badge variant={role === Role.ADMIN ? "default" : "secondary"}>{role}</Badge>
  );
}

export function UsersTable({ users }: { users: UserListItem[] }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[25%]">Name</TableHead>
          <TableHead className="w-[31%]">Email</TableHead>
          <TableHead className="w-[16%]">Role</TableHead>
          <TableHead className="w-[16%]">Joined</TableHead>
          <TableHead className="w-[12%] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="truncate font-medium">{user.name ?? "—"}</TableCell>
            <TableCell className="truncate text-muted-foreground">{user.email}</TableCell>
            <TableCell>
              <RoleBadge role={user.role} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {dateFormatter.format(new Date(user.createdAt))}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <EditUserDialog user={user} />
                <DeleteUserDialog user={user} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

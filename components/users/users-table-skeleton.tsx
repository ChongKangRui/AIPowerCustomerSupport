import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export function UsersTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[28%]">Name</TableHead>
          <TableHead className="w-[34%]">Email</TableHead>
          <TableHead className="w-[19%]">Role</TableHead>
          <TableHead className="w-[19%]">Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-3/4" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-4/5" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-14 rounded-4xl" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-2/3" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

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
          <TableHead className="w-[25%]">Name</TableHead>
          <TableHead className="w-[31%]">Email</TableHead>
          <TableHead className="w-[16%]">Role</TableHead>
          <TableHead className="w-[16%]">Joined</TableHead>
          <TableHead className="w-[12%] text-right">Actions</TableHead>
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
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CellData, ReactTable, RowData, TableFeatures } from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Column defs across the app (components/tickets/use-tickets-table.tsx, components/users/use-users-table.tsx) carry their own layout through `meta`, instead of a separate id-keyed className lookup per table.
// headerClassName controls the <th>, for column width and alignment.
// cellClassName controls the <td>, for truncation, muted text, and similar styling.
//
// This is module augmentation, the same pattern TanStack's own docs use for extending ColumnMeta.
// It is what makes `meta: { headerClassName: "...", cellClassName: "..." }` type-check at each column-def call site in use-tickets-table.tsx and use-users-table.tsx.
declare module "@tanstack/react-table" {
  // The generic params must match ColumnMeta's own signature for the interfaces to merge.
  // This augmentation's body does not need to reference them.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  interface ColumnMeta<
    TFeatures extends TableFeatures,
    TData extends RowData,
    TValue extends CellData = CellData,
  > {
    headerClassName?: string;
    cellClassName?: string;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

// header.column and cell.column's sorting methods, and columnDef.meta, are only visible to TS when TFeatures is known to include rowSortingFeature.
// That runs through TanStack's `Extract<keyof TFeatures, ...>` feature-map algebra.
// But DataTable is deliberately generic over ANY TFeatures, including use-users-table.tsx's `tableFeatures({})` — Users registers no extra features at all, sorting or otherwise. See that file's comment.
//
// Rather than force every table to register rowSortingFeature just to satisfy this component's types, these two narrow shapes describe only the bits this file actually reads off a column at runtime, true for any TFeatures.
// They are checked with `?.`, since the methods and meta genuinely may be absent.
// meta is always optional. Sorting methods are absent for a table that did not register rowSortingFeature.
// In that case getCanSort would be undefined, and the plain-header branch below is taken, unchanged from today's actual behavior.
type SortableColumn = {
  getCanSort?: () => boolean;
  getIsSorted?: () => false | "asc" | "desc";
  getToggleSortingHandler?: () => ((event: unknown) => void) | undefined;
};
type ColumnLayoutMeta = { headerClassName?: string; cellClassName?: string };

// This is a shared TanStack Table rendering shell.
// It replaces what used to be near-identical thead/tbody JSX duplicated between TicketsTable and UsersTable: a sortable-header button plus an aria-sort/direction icon for any column with getCanSort() true, a plain header otherwise, and FlexRender for every cell.
//
// Each domain owns its own column defs — identity, sortability, cell renderers, meta — through its own useXTable() hook (components/tickets/use-tickets-table.tsx, components/users/use-users-table.tsx).
// This component only renders whatever `table` instance it is handed, with no entity-specific knowledge.
//
// A column with no sort feature registered or enabled — every Users column, or Tickets' Customer and Assigned columns — just renders its plain header.
// The sortable-header branch is a no-op for them, not a per-table opt-out.
export function DataTable<TFeatures extends TableFeatures, TData extends RowData>({
  table,
}: {
  table: ReactTable<TFeatures, TData, unknown>;
}) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const sortableColumn = header.column as unknown as SortableColumn;
              const meta = header.column.columnDef.meta as ColumnLayoutMeta | undefined;
              const canSort = sortableColumn.getCanSort?.() ?? false;
              const sorted = canSort ? (sortableColumn.getIsSorted?.() ?? false) : false;

              return (
                <TableHead
                  key={header.id}
                  className={meta?.headerClassName}
                  aria-sort={
                    !canSort
                      ? undefined
                      : sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : "none"
                  }
                >
                  {header.isPlaceholder ? null : canSort ? (
                    <button
                      type="button"
                      onClick={sortableColumn.getToggleSortingHandler?.()}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <table.FlexRender header={header} />
                      {sorted === "asc" ? (
                        <ArrowUp className="size-3.5" />
                      ) : sorted === "desc" ? (
                        <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
                      )}
                    </button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => {
              const meta = cell.column.columnDef.meta as ColumnLayoutMeta | undefined;
              return (
                <TableCell key={cell.id} className={meta?.cellClassName}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

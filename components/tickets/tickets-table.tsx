import { DataTable } from "@/components/ui/data-table";
import type { useTicketsTable } from "@/components/tickets/use-tickets-table";

// This is a thin wrapper over the shared DataTable.
// All column identity, sortability, cell rendering, and layout (meta.headerClassName and cellClassName) live in use-tickets-table.ts's column defs.
// DataTable owns the generic thead/tbody chrome — sortable-header buttons, aria-sort, FlexRender — shared with UsersTable.
//
// This stays a named component, rather than inlining `<DataTable table={table} />` directly in TicketsView, so there is a stable, domain-named unit to import and test.
export function TicketsTable({ table }: { table: ReturnType<typeof useTicketsTable> }) {
  return <DataTable table={table} />;
}

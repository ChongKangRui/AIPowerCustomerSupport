import { DataTable } from "@/components/ui/data-table";
import type { useTicketsTable } from "@/components/tickets/use-tickets-table";

// Thin wrapper over the shared DataTable — all column identity, sortability,
// cell rendering, and layout (meta.headerClassName/cellClassName) live in
// use-tickets-table.ts's column defs; DataTable owns the generic thead/tbody
// chrome (sortable-header buttons, aria-sort, FlexRender) shared with
// UsersTable. Kept as a named component (rather than inlining
// `<DataTable table={table} />` directly in TicketsView) for a stable,
// domain-named unit to import/test.
export function TicketsTable({ table }: { table: ReturnType<typeof useTicketsTable> }) {
  return <DataTable table={table} />;
}

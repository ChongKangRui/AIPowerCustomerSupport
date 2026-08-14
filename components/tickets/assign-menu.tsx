"use client";

import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserListItem } from "@/models/user.model";

// Radix's DropdownMenuRadioGroup needs a string value for every item,
// including "no one" — this sentinel stands in for `assignedToId: null` in
// the group's own value/onValueChange, translated back to/from null at the
// edges of this component so every caller just deals in `string | null`.
const UNASSIGNED_VALUE = "__unassigned__";

type AssignMenuProps = {
  agents: UserListItem[];
  value: string | null;
  onAssign: (assignedToId: string | null) => void;
  disabled?: boolean;
  children: ReactNode;
};

// The one "assign to…" control, reused by three call sites that otherwise
// look nothing alike — the detail page header (ticket-detail-header.tsx),
// the tickets table's per-row assign cell, and the tickets-view bulk
// toolbar (use-tickets-table.tsx / tickets-view.tsx) — each supplies its own
// trigger markup via `children` (asChild'd onto DropdownMenuTrigger) and
// gets the same "Unassigned" + one radio item per agent list back.
// `disabled` is a single boolean on purpose: callers fold "not an admin" and
// "ticket isn't OPEN" into it themselves — this component doesn't need to
// know which reason applies.
export function AssignMenu({ agents, value, onAssign, disabled, children }: AssignMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value ?? UNASSIGNED_VALUE}
          onValueChange={(next) => onAssign(next === UNASSIGNED_VALUE ? null : next)}
        >
          <DropdownMenuRadioItem value={UNASSIGNED_VALUE}>Unassigned</DropdownMenuRadioItem>
          {agents.map((agent) => (
            <DropdownMenuRadioItem key={agent.id} value={agent.id}>
              {agent.name ?? agent.email}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

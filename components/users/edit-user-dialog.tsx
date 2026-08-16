"use client";

import { useState } from "react";

import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import type { UserListItem } from "@/models/user.model";

// This is the per-row "edit" icon button, rendered in components/users/users-table.tsx.
// Each row gets its own instance, keyed to that row's user through the table's existing key={user.id}, and each owns its own open state.
// See UserFormDialog's comment for why the open-on-reset logic depends on that.
//
// The actual dialog and form is UserFormDialog, shared with the "New user" trigger in components/users/create-user-dialog.tsx.
export function EditUserDialog({ user }: { user: UserListItem }) {
  const [open, setOpen] = useState(false);

  return (
    <UserFormDialog
      open={open}
      onOpenChange={setOpen}
      user={user}
      trigger={
        <Button variant="ghost" size="icon-sm">
          <Pencil />
          <span className="sr-only">Edit {user.name ?? user.email}</span>
        </Button>
      }
    />
  );
}

"use client";

import { useState } from "react";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserFormDialog } from "@/components/users/user-form-dialog";

// "New user" button for the admin Users page (rendered above UsersTable in
// components/users/users-view.tsx). Owns only the trigger + open state; the
// actual dialog/form is UserFormDialog, shared with the per-row edit button
// in components/users/edit-user-dialog.tsx.
export function CreateUserDialog() {
  const [open, setOpen] = useState(false);

  return (
    <UserFormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button className="ml-auto" data-icon="inline-start">
          <Plus />
          New user
        </Button>
      }
    />
  );
}

"use client";

import { useState } from "react";

import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteUser } from "@/hooks/use-delete-user";
import { Role } from "@/lib/generated/prisma/enums";
import type { UserListItem } from "@/models/user.model";

// This is the per-row "delete" icon button, rendered in components/users/users-table.tsx alongside EditUserDialog.
// Each row gets its own instance with its own open state, the same self-contained pattern as edit-user-dialog.tsx.
//
// Unlike the create and edit flow, this does not reuse UserFormDialog.
// This is a confirmation, not a form, so it wraps the semantically distinct AlertDialog instead of the generic Dialog.
export function DeleteUserDialog({ user }: { user: UserListItem }) {
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === Role.ADMIN;
  const label = user.name ?? user.email;

  const deleteUserMutation = useDeleteUser();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) deleteUserMutation.reset();
  }

  // AlertDialogAction renders Radix's Dialog.Close under the hood.
  // That auto-closes the dialog on click: composeEventHandlers runs our onClick, then its own onOpenChange(false), unless we call preventDefault.
  //
  // Without preventDefault, the dialog would close immediately on click, before the mutation even resolves.
  // A failed delete's error message would never be visible.
  // preventDefault stops that. open is instead driven manually, through the mutation's own onSuccess.
  function handleDelete(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    deleteUserMutation.mutate(user.id, {
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="icon-sm" disabled={isAdmin}>
          <Trash2 />
          <span className="sr-only">
            {isAdmin ? "Admin users cannot be deleted" : `Delete ${label}`}
          </span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            They&rsquo;ll no longer be able to log in. This can&rsquo;t be undone from here.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {deleteUserMutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {deleteUserMutation.error.message}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteUserMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteUserMutation.isPending}
            onClick={handleDelete}
          >
            {deleteUserMutation.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

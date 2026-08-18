"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ControlledField } from "@/components/ui/controlled-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { useCreateUser } from "@/hooks/use-create-user";
import { useUpdateUser } from "@/hooks/use-update-user";
import { createUserSchema, updateUserSchema } from "@/models/user.model";
import type { UserListItem } from "@/models/user.model";

type UserFormValues = { name: string; email: string; password: string };

const BLANK_VALUES: UserFormValues = { name: "", email: "", password: "" };

function valuesFromUser(user: UserListItem): UserFormValues {
  return { name: user.name ?? "", email: user.email, password: "" };
}

type UserFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  /** Omit to create a new user. Pass the row being edited to edit it. */
  user?: UserListItem;
};

// This is the actual "user form" dialog.
// The "New user" button (components/users/create-user-dialog.tsx) and each row's edit button (components/users/edit-user-dialog.tsx) share it.
// Both are thin wrappers. They only own a trigger element and open state, and hand those to this component.
// This component owns the Dialog and the form itself.
//
// The two triggers are structurally different: a static toolbar button versus a per-row icon button.
// Unifying them too was not worth it.
// But the form mechanics are identical, apart from a few bits of copy, validation, and mutation swapped by mode.
export function UserFormDialog({ open, onOpenChange, trigger, user }: UserFormDialogProps) {
  const isEdit = user !== undefined;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema),
    defaultValues: user ? valuesFromUser(user) : BLANK_VALUES,
  });

  // Both mutations are always called here.
  // A conditional hook call like `isEdit ? useUpdateUser() : useCreateUser()` would break react-hooks/rules-of-hooks.
  // The linter cannot prove that a given instance's isEdit never changes, even though each wrapper below only ever passes one fixed value in practice.
  //
  // useUpdateUser()'s own useCurrentUser() call just subscribes to an already-warm ["session"] query.
  // So calling it even in create mode costs nothing extra.
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const mutation = isEdit ? updateUserMutation : createUserMutation;

  function closeAndReset() {
    form.reset();
    onOpenChange(false);
  }

  function onSubmit(values: UserFormValues) {
    if (user) {
      updateUserMutation.mutate({ id: user.id, values }, { onSuccess: closeAndReset });
    } else {
      createUserMutation.mutate(values, { onSuccess: closeAndReset });
    }
  }

  // This resets the form and mutation state whenever the dialog closes: Cancel, an overlay click, or Escape.
  // Reopening it then always starts clean.
  //
  // This also resets on open, not just once at mount.
  // RHF's defaultValues is a mount-time snapshot.
  // But an edit dialog is a long-lived per-row instance (see edit-user-dialog.tsx), and its underlying user data can change while it is closed.
  // One example: another admin edits the same row, which refetches ["users"].
  // Resetting on every open picks up whatever is current, instead of what was true when this component first mounted.
  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (nextOpen) {
      form.reset(user ? valuesFromUser(user) : BLANK_VALUES);
    } else {
      form.reset();
      mutation.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit user" : "New user"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update this user's name, email, or password. Leave the password blank to keep it unchanged."
                : "Creates an agent account. They can log in with this email and password right away."}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <ControlledField
              name="name"
              control={form.control}
              label="Name"
              inputProps={{ autoComplete: "off", placeholder: "Ada Lovelace" }}
            />

            <ControlledField
              name="email"
              control={form.control}
              label="Email"
              inputProps={{ type: "email", autoComplete: "off", placeholder: "you@example.com" }}
            />

            <ControlledField
              name="password"
              control={form.control}
              label={isEdit ? "New password" : "Password"}
              inputProps={{
                type: "password",
                autoComplete: "new-password",
                placeholder: isEdit ? "Leave blank to keep current password" : undefined,
              }}
            />

            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {isEdit
                ? mutation.isPending
                  ? "Saving…"
                  : "Save changes"
                : mutation.isPending
                  ? "Creating…"
                  : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

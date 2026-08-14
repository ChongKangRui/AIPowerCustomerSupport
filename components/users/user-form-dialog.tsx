"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  /** Omit to create a new user; pass the row being edited to edit it. */
  user?: UserListItem;
};

// The actual "user form" dialog, shared by the "New user" button
// (components/users/create-user-dialog.tsx) and each row's edit button
// (components/users/edit-user-dialog.tsx) — both are thin wrappers that only
// own a trigger element + open state and hand them to this component, which
// owns the Dialog/form itself. The two triggers are structurally different
// enough (a static toolbar button vs. a per-row icon button) that unifying
// them too wasn't worth it, but the form mechanics are identical modulo a
// few bits of copy/validation/mutation swapped by mode.
export function UserFormDialog({ open, onOpenChange, trigger, user }: UserFormDialogProps) {
  const isEdit = user !== undefined;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema),
    defaultValues: user ? valuesFromUser(user) : BLANK_VALUES,
  });

  // Both mutations are always called — never picked with a conditional hook
  // call like `isEdit ? useUpdateUser() : useCreateUser()`, which would trip
  // react-hooks/rules-of-hooks (the linter can't prove a given instance's
  // isEdit never changes, even though in practice each wrapper below only
  // ever passes one fixed value). useUpdateUser()'s own useCurrentUser()
  // call is just a subscription to an already-warm ["session"] query, so
  // calling it even in create mode costs nothing extra.
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

  // Reset form + mutation state whenever the dialog closes (Cancel, overlay
  // click, Escape) so reopening it always starts clean. Also reset *on
  // open*, not just once at mount: RHF's defaultValues is a mount-time
  // snapshot, but an edit dialog is a long-lived per-row instance (see
  // edit-user-dialog.tsx) whose underlying user data can change while it's
  // closed (e.g. another admin edits the same row, refetching ["users"]) —
  // resetting on every open picks up whatever's current instead of what was
  // true whenever this component first mounted.
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
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                    placeholder="Ada Lovelace"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="email"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                    placeholder="you@example.com"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {isEdit ? "New password" : "Password"}
                  </FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                    placeholder={isEdit ? "Leave blank to keep current password" : undefined}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
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

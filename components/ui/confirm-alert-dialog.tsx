"use client";

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

type ConfirmAlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  error?: string | null;
  /** Drives both the disabled state and the confirm button's label. */
  pending: boolean;
  confirmLabel: string;
  pendingLabel: string;
  actionVariant?: React.ComponentProps<typeof AlertDialogAction>["variant"];
  // AlertDialogAction auto-closes on click (it renders Radix's Dialog.Close).
  // Callers must call event.preventDefault() and close manually once their
  // mutation resolves — see delete-user-dialog.tsx's handleDelete for the
  // original writeup of why.
  onConfirm: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

// The confirm-then-mutate AlertDialog shape shared by the ticket resolve/close
// actions (ticket-detail-view.tsx) and the user delete action
// (delete-user-dialog.tsx): a trigger, a title/description, an inline mutation
// error, and a Cancel/Action footer that disables while pending and swaps its
// label to a progress verb.
export function ConfirmAlertDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  error,
  pending,
  confirmLabel,
  pendingLabel,
  actionVariant,
  onConfirm,
}: ConfirmAlertDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={actionVariant} disabled={pending} onClick={onConfirm}>
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { UpdateUserInput } from "@/models/user.model";
import type { UserListItem } from "@/models/user.model";

// This is the admin "edit user" mutation.
// It uses the same TanStack Query and apiClient pattern as useCreateUser (hooks/use-create-user.ts).
// It invalidates ["users"], so the table picks up the change without a manual refetch.
// It also invalidates ["session"] when the edited user is the one currently logged in.
//
// The navbar and role-gated UI read from that separate query (hooks/use-current-user.ts), not from ["users"].
// Without this second invalidation, an admin who edits their own name or email would see stale info in the navbar until a manual refresh.
export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();

  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateUserInput }) =>
      apiClient.patch<UserListItem>(`/api/users/${id}`, values).then((res) => res.data),
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      if (currentUser?.id === updatedUser.id) {
        queryClient.invalidateQueries({ queryKey: ["session"] });
      }
    },
  });
}

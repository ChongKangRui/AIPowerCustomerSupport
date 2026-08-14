"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { UpdateUserInput } from "@/models/user.model";
import type { UserListItem } from "@/models/user.model";

// Admin "edit user" mutation — same TanStack Query + apiClient pattern as
// useCreateUser (hooks/use-create-user.ts). Besides invalidating ["users"]
// (so the table picks up the change without a manual refetch), it also
// invalidates ["session"] when the edited user is the one currently logged
// in — the navbar/role-gated UI read from that separate query
// (hooks/use-current-user.ts), not from ["users"], so without this an admin
// editing their own name/email would see stale info in the navbar until a
// manual refresh.
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

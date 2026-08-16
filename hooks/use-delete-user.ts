"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

// This is the admin "delete user" mutation.
// It uses the same TanStack Query and apiClient pattern as useUpdateUser (hooks/use-update-user.ts).
// It invalidates ["users"] on success, so the table drops the deleted row without a manual refetch.
//
// This needs no ["session"] invalidation.
// DELETE /api/users/[id] returns a 403 error if the target is an Admin.
// So the currently logged-in admin can never be the user this deletes.
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

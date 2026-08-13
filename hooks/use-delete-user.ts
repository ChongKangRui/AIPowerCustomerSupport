"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

// Admin "delete user" mutation — same TanStack Query + apiClient pattern as
// useUpdateUser (hooks/use-update-user.ts). Invalidates ["users"] on
// success so the table drops the deleted row without a manual refetch. No
// ["session"] invalidation needed: DELETE /api/users/[id] 403s if the
// target is an Admin, so the currently-logged-in admin can never be the
// user being deleted here.
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { CreateUserInput } from "@/models/user.model";
import type { UserListItem } from "@/models/user.model";

// This is the admin "create user" mutation.
// It uses the same TanStack Query and apiClient pattern as the login mutation in app/login/login-form.tsx.
// It invalidates the ["users"] query on success, so the list in useUsers() (hooks/use-users.ts) picks up the new row without a manual refetch.
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CreateUserInput) =>
      apiClient.post<UserListItem>("/api/users", values).then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

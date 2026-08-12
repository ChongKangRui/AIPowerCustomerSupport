"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiClient } from "@/lib/api-client";

function initialsFor(name: string | null, email: string | null) {
  const source = name ?? email ?? "?";
  return source.trim().charAt(0).toUpperCase();
}

export function Navbar() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading } = useCurrentUser();

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.post("/api/logout"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      router.push("/login");
    },
  });

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <Link href="/" className="font-semibold">
        AI Customer Support
      </Link>

      <div className="flex items-center gap-2">
        {isLoading ? null : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-muted"
              >
                <Avatar size="sm">
                  <AvatarFallback>{initialsFor(user.name, user.email)}</AvatarFallback>
                </Avatar>
                <span>{user.name ?? user.email}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{user.name ?? "Unnamed user"}</span>
                  {user.email && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending ? "Logging out…" : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}

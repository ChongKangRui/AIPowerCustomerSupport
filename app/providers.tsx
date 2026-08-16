"use client";

import { QueryClient, QueryClientProvider, environmentManager } from "@tanstack/react-query";

// This is the standard TanStack Query v5 App Router pattern.
// On the server, this always makes a fresh QueryClient per request, with no shared state across requests or users.
// In the browser, this reuses one client for the lifetime of the tab, so cached data — such as the current session — survives client-side navigations instead of being thrown away on every render.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

// This branches per makeQueryClient's comment above: a fresh client on the server, the one shared client in the browser.
function getQueryClient() {
  if (environmentManager.isServer()) {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

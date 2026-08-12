"use client";

import { QueryClient, QueryClientProvider, environmentManager } from "@tanstack/react-query";

// Standard TanStack Query v5 App Router pattern: on the server, always make a
// fresh QueryClient per request (no shared state across requests/users). In
// the browser, reuse one client for the lifetime of the tab so cached data
// (e.g. the current session) survives client-side navigations instead of
// being thrown away on every render.
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

// ensure that in the server side render
// provide a short live duration of query client in server side
// provide the cache client in browser side
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

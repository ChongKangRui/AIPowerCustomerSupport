import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Role, TicketStatus } from "@/lib/generated/prisma/enums";
import { TicketsView } from "@/components/tickets/tickets-view";
import type { TicketListItem, TicketListResponse } from "@/models/ticket.model";
import type { UserListItem } from "@/models/user.model";

const tickets: TicketListItem[] = [
  {
    id: "ticket-1",
    subject: "Can't log in",
    status: TicketStatus.OPEN,
    customerEmail: "customer@example.com",
    customerName: null,
    assignedTo: null,
    resolvedByAi: false,
    createdAt: "2026-01-01T12:00:00.000Z",
  },
];

// total: 45 (3 pages at TICKET_PAGE_SIZE=20) regardless of which page/sort
// was requested — these tests assert on what TicketsView *requests* and
// *navigates to* (apiClient.get's params, router.replace's query string),
// not on server-side paging/sorting itself, which is covered server-side by
// models/ticket.model.test.ts + the e2e suite.
const apiClientMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: apiClientMocks }));

// TicketsView also calls useCurrentUser() (GET /api/auth/session, for the
// admin check gating the select column/bulk toolbar) and useUsers()
// (GET /api/users, the assignee list) — apiClientMocks.get is shared across
// every GET this component makes, so it has to branch on the requested url.
// Defaults to isAdmin: false / agents: [] (the pre-assignment beforeEach
// behavior every existing test below still relies on); tests that need the
// admin path call this again with isAdmin: true before rendering.
function mockApiGet({ isAdmin = false, agents = [] as UserListItem[] } = {}) {
  apiClientMocks.get.mockImplementation((url: string) => {
    if (url === "/api/auth/session") {
      return Promise.resolve({
        data: isAdmin
          ? { user: { id: "admin-1", name: "Admin", email: "admin@example.com", image: null, role: Role.ADMIN }, expires: "2099-01-01" }
          : null,
      });
    }
    if (url === "/api/users") {
      return Promise.resolve({ data: { users: agents } });
    }
    return Promise.resolve({ data: { tickets, total: 45, page: 1, pageSize: 20 } });
  });
}

// TicketsView reads page/sort from useSearchParams and navigates via
// router.replace(pathname + query, { scroll: false }) — mocked the same way
// app/login/login-form.test.tsx mocks next/navigation, since none of this
// needs an actual Next.js App Router tree. navigationMocks.searchParams is
// mutable per-test (set before render) so "initial state read from the URL"
// can be exercised directly, unlike login-form.test.tsx which never varies it.
const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/tickets",
  useRouter: () => ({ replace: navigationMocks.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => navigationMocks.searchParams,
}));

beforeEach(() => {
  navigationMocks.searchParams = new URLSearchParams();
  mockApiGet();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTicketsView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TicketsView />
    </QueryClientProvider>
  );
  // Exposed so a test can simulate a URL change actually taking effect (see
  // the "changing the status filter" selection-reset test below) — router.replace
  // is mocked to a no-op (it doesn't touch navigationMocks.searchParams), so
  // nothing re-renders TicketsView with new params on its own the way a real
  // Next.js navigation would; a test has to mutate navigationMocks.searchParams
  // itself and force this same tree to re-render.
  return {
    ...view,
    rerenderWithCurrentSearchParams: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <TicketsView />
        </QueryClientProvider>
      ),
  };
}

// Coverage for TicketsView's URL-sync *wiring* — reading initial page/sort
// off the URL, and that a sort-header click or a Previous/Next click
// navigates via router.replace with the right query string. This is new
// ground for this codebase (no existing component writes to the URL — see
// this component's own comment), so it's covered here rather than only via
// e2e. TicketsTable/TicketsPagination's own rendering and
// useTicketsTable's TanStack-shape translation have their own dedicated
// tests; this file only proves TicketsView glues them to the URL correctly.
// The real GET /api/tickets sort/pagination behavior needs a real backend
// and stays in e2e/tickets.spec.ts.
describe("TicketsView", () => {
  it("requests the page/sort/status/q read from the initial URL", async () => {
    navigationMocks.searchParams = new URLSearchParams(
      "page=2&sortBy=status&sortDir=asc&status=OPEN&q=login"
    );

    renderTicketsView();

    await screen.findByText(tickets[0].subject);
    expect(apiClientMocks.get).toHaveBeenCalledWith(
      "/api/tickets",
      expect.objectContaining({
        params: { page: 2, sortBy: "status", sortDir: "asc", status: "OPEN", q: "login" },
      })
    );
  });

  it("defaults to page 1 / createdAt desc / no status filter / no search when the URL has no params", async () => {
    renderTicketsView();

    await screen.findByText(tickets[0].subject);
    expect(apiClientMocks.get).toHaveBeenCalledWith(
      "/api/tickets",
      expect.objectContaining({
        params: { page: 1, sortBy: "createdAt", sortDir: "desc", status: "ALL", q: "" },
      })
    );
  });

  it("clicking a sortable header navigates to that sort, ascending, and resets to page 1", async () => {
    navigationMocks.searchParams = new URLSearchParams("page=3&sortBy=createdAt&sortDir=desc");
    renderTicketsView();
    await screen.findByText(tickets[0].subject);

    (await screen.findByRole("button", { name: "Subject" })).click();

    expect(navigationMocks.replace).toHaveBeenCalledWith(
      "/tickets?page=1&sortBy=subject&sortDir=asc",
      { scroll: false }
    );
  });

  it("clicking Next navigates to page + 1, preserving the current sort", async () => {
    navigationMocks.searchParams = new URLSearchParams("page=1&sortBy=status&sortDir=asc");
    renderTicketsView();
    await screen.findByText(tickets[0].subject);

    (await screen.findByRole("button", { name: "Next" })).click();

    expect(navigationMocks.replace).toHaveBeenCalledWith(
      "/tickets?page=2&sortBy=status&sortDir=asc",
      { scroll: false }
    );
  });

  it("clicking Previous navigates to page - 1, preserving the current sort", async () => {
    navigationMocks.searchParams = new URLSearchParams("page=2&sortBy=status&sortDir=asc");
    renderTicketsView();
    await screen.findByText(tickets[0].subject);

    (await screen.findByRole("button", { name: "Previous" })).click();

    expect(navigationMocks.replace).toHaveBeenCalledWith(
      "/tickets?page=1&sortBy=status&sortDir=asc",
      { scroll: false }
    );
  });

  it("changing the status filter navigates immediately (no debounce) and resets to page 1", async () => {
    navigationMocks.searchParams = new URLSearchParams("page=3");
    renderTicketsView();
    await screen.findByText(tickets[0].subject);

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "OPEN" } });

    expect(navigationMocks.replace).toHaveBeenCalledWith(
      "/tickets?page=1&sortBy=createdAt&sortDir=desc&status=OPEN",
      { scroll: false }
    );
  });

  it("picking \"All statuses\" again drops the status param from the URL", async () => {
    navigationMocks.searchParams = new URLSearchParams("status=OPEN");
    renderTicketsView();
    await screen.findByText(tickets[0].subject);

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "ALL" } });

    expect(navigationMocks.replace).toHaveBeenCalledWith(
      "/tickets?page=1&sortBy=createdAt&sortDir=desc",
      { scroll: false }
    );
  });

  describe("debounced search", () => {
    afterEach(() => vi.useRealTimers());

    // setState calls that happen inside a fake-timer callback aren't picked
    // up by React unless the advance itself runs inside act() — see
    // hooks/use-debounced-value.test.ts's own comment for the same gotcha.
    it("does not navigate until 700ms of no further typing has passed", async () => {
      renderTicketsView();
      await screen.findByText(tickets[0].subject);

      vi.useFakeTimers();
      fireEvent.change(screen.getByLabelText("Search tickets"), { target: { value: "login" } });

      await act(() => vi.advanceTimersByTimeAsync(699));
      expect(navigationMocks.replace).not.toHaveBeenCalled();

      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(navigationMocks.replace).toHaveBeenCalledWith(
        "/tickets?page=1&sortBy=createdAt&sortDir=desc&q=login",
        { scroll: false }
      );
    });

    it("resets the debounce window on every keystroke — only the final value ever commits", async () => {
      renderTicketsView();
      await screen.findByText(tickets[0].subject);

      vi.useFakeTimers();
      const searchInput = screen.getByLabelText("Search tickets");
      fireEvent.change(searchInput, { target: { value: "log" } });
      await act(() => vi.advanceTimersByTimeAsync(699)); // one tick short of committing "log"
      fireEvent.change(searchInput, { target: { value: "login" } }); // resets the window

      await act(() => vi.advanceTimersByTimeAsync(699));
      expect(navigationMocks.replace).not.toHaveBeenCalled(); // still reset, not committed

      await act(() => vi.advanceTimersByTimeAsync(1));
      // Only ever navigates once, and with the latest value — never with the
      // intermediate "log".
      expect(navigationMocks.replace).toHaveBeenCalledTimes(1);
      expect(navigationMocks.replace).toHaveBeenCalledWith(
        "/tickets?page=1&sortBy=createdAt&sortDir=desc&q=login",
        { scroll: false }
      );
    });
  });

  // The select column/per-row assign control's own rendering is covered by
  // tickets-table.test.tsx; the assign control's admin/OPEN gating by
  // ticket-detail-header.test.tsx (same gating logic, mirrored here). What's
  // left to prove at this level: the bulk toolbar appears/disappears with
  // selection, a bulk assign round-trips through the real mutation, and —
  // the trickiest bit, since it's what tripped the
  // react-hooks/set-state-in-effect lint rule during development — selection
  // is genuinely cleared by any page/sort/status/q change, not just by
  // clicking Clear.
  describe("bulk assign toolbar (admin)", () => {
    const agents: UserListItem[] = [
      { id: "agent-1", name: "Grace Hopper", email: "grace@example.com", role: Role.AGENT, createdAt: "" },
    ];

    it("shows \"1 ticket selected\" once a row is checked, and hides it again on Clear", async () => {
      mockApiGet({ isAdmin: true, agents });
      renderTicketsView();
      await screen.findByText(tickets[0].subject);

      fireEvent.click(screen.getByRole("checkbox", { name: `Select ${tickets[0].subject}` }));
      expect(await screen.findByText("1 ticket selected")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
      expect(screen.queryByText("1 ticket selected")).toBeNull();
    });

    it("picking an agent in the toolbar PATCHes /api/tickets/assign with the selected ticket ids", async () => {
      mockApiGet({ isAdmin: true, agents });
      renderTicketsView();
      await screen.findByText(tickets[0].subject);

      fireEvent.click(screen.getByRole("checkbox", { name: `Select ${tickets[0].subject}` }));
      await screen.findByText("1 ticket selected");

      // Radix's DropdownMenuTrigger opens on pointerdown, not click — see
      // ticket-detail-header.test.tsx's "assign control" describe block.
      fireEvent.pointerDown(screen.getByRole("button", { name: "Assign to…" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitemradio", { name: "Grace Hopper" }));

      // Unlike the plain-callback assertions in tickets-table.test.tsx/
      // ticket-detail-header.test.tsx (onAssign/onAssignOne fire synchronously
      // through React's event handling), this goes through a real
      // useMutation().mutate() call — same reasoning as
      // ticket-detail-view.test.tsx's PATCH assertions, which all wait too.
      await waitFor(() =>
        expect(apiClientMocks.patch).toHaveBeenCalledWith("/api/tickets/assign", {
          ticketIds: ["ticket-1"],
          assignedToId: "agent-1",
        })
      );
    });

    it("the URL's status param actually changing (e.g. after a real navigation) clears the current selection", async () => {
      mockApiGet({ isAdmin: true, agents });
      const { rerenderWithCurrentSearchParams } = renderTicketsView();
      await screen.findByText(tickets[0].subject);

      fireEvent.click(screen.getByRole("checkbox", { name: `Select ${tickets[0].subject}` }));
      await screen.findByText("1 ticket selected");

      // router.replace is mocked to a no-op — see renderTicketsView's own
      // comment — so this simulates what a real navigation (a status-filter
      // change, or equally a browser back/forward) leaves TicketsView
      // reading on its next render.
      navigationMocks.searchParams = new URLSearchParams("status=OPEN");
      rerenderWithCurrentSearchParams();

      expect(screen.queryByText("1 ticket selected")).toBeNull();
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { NotificationType } from "@/lib/generated/prisma/enums";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { NotificationItem } from "@/models/notification.model";

// apiClient is mocked, not hit for real — same pattern as
// tickets-view.test.tsx: apiClientMocks.get is shared across every GET
// this component makes (just one here, GET /api/notifications), and
// .patch covers both mark-read endpoints.
const apiClientMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: apiClientMocks }));

// handleSelect only ever calls router.push, never replace/refresh — kept
// minimal, unlike tickets-view.test.tsx's fuller next/navigation mock,
// since this component reads no URL state at all.
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

// <Toaster /> isn't mounted here (it lives in app/providers.tsx) — mock
// toast() directly so these tests can assert what got flashed.
const toastMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: toastMock }));

function notification(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: "notif-1",
    ticketId: "ticket-1",
    type: NotificationType.TICKET_ASSIGNED,
    message: "New ticket assigned to you: Refund request",
    readAt: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

function mockApiGet(notifications: NotificationItem[], unreadCount: number) {
  apiClientMocks.get.mockResolvedValue({ data: { notifications, unreadCount } });
}

beforeEach(() => {
  mockApiGet([], 0);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Exposes queryClient so a test can force a refetch by invalidating
// ["notifications"] directly, instead of waiting on the real 20s
// refetchInterval.
function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NotificationBell />
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

async function openDropdown() {
  // Radix's DropdownMenuTrigger opens on pointerdown, not click — see
  // tickets-table.test.tsx's "picking an agent from a row's assign menu" test.
  fireEvent.pointerDown(screen.getByRole("button", { name: "Notifications" }), { button: 0 });
  await screen.findByText("Notifications");
}

describe("NotificationBell", () => {
  it("renders no unread badge when unreadCount is 0", async () => {
    mockApiGet([], 0);
    renderBell();

    await waitFor(() => expect(apiClientMocks.get).toHaveBeenCalled());
    expect(screen.queryByText(/^\d+$|^9\+$/)).toBeNull();
  });

  it("renders the unread count on the badge", async () => {
    mockApiGet([notification({})], 3);
    renderBell();

    expect(await screen.findByText("3")).toBeTruthy();
  });

  it("caps the badge at '9+' for 10 or more unread", async () => {
    mockApiGet([notification({})], 12);
    renderBell();

    expect(await screen.findByText("9+")).toBeTruthy();
    expect(screen.queryByText("12")).toBeNull();
  });

  it("shows 'No notifications yet' when the list is empty", async () => {
    mockApiGet([], 0);
    renderBell();
    await waitFor(() => expect(apiClientMocks.get).toHaveBeenCalled());

    await openDropdown();

    expect(await screen.findByText("No notifications yet")).toBeTruthy();
  });

  it("lists each notification's message and formatted date", async () => {
    const createdAt = "2026-01-01T12:00:00.000Z";
    mockApiGet([notification({ message: "Ticket reopened: Refund request", createdAt })], 1);
    renderBell();
    await waitFor(() => expect(apiClientMocks.get).toHaveBeenCalled());

    await openDropdown();

    expect(await screen.findByText("Ticket reopened: Refund request")).toBeTruthy();
    // Computed, not hardcoded — a fixed wall-clock string only matches
    // on whatever timezone runs this test.
    const expectedDate = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(createdAt));
    expect(screen.getByText(expectedDate)).toBeTruthy();
  });

  it("clicking an unread notification marks it read and navigates to its ticket", async () => {
    apiClientMocks.patch.mockResolvedValue({ data: { ok: true } });
    mockApiGet([notification({ id: "notif-1", ticketId: "ticket-42", readAt: null })], 1);
    renderBell();
    await waitFor(() => expect(apiClientMocks.get).toHaveBeenCalled());
    await openDropdown();

    const item = (await screen.findByText(/New ticket assigned/)).closest('[role="menuitem"]')!;
    fireEvent.click(item);

    // markRead.mutate() hits the PATCH a tick later than the click;
    // router.push is synchronous, so it's already true.
    await waitFor(() =>
      expect(apiClientMocks.patch).toHaveBeenCalledWith("/api/notifications/notif-1/read")
    );
    expect(routerMocks.push).toHaveBeenCalledWith("/tickets/ticket-42");
  });

  it("clicking an already-read notification navigates but does not call mark-read", async () => {
    mockApiGet(
      [notification({ id: "notif-1", ticketId: "ticket-42", readAt: "2026-01-01T13:00:00.000Z" })],
      0
    );
    renderBell();
    await waitFor(() => expect(apiClientMocks.get).toHaveBeenCalled());
    await openDropdown();

    const item = (await screen.findByText(/New ticket assigned/)).closest('[role="menuitem"]')!;
    fireEvent.click(item);

    expect(apiClientMocks.patch).not.toHaveBeenCalled();
    expect(routerMocks.push).toHaveBeenCalledWith("/tickets/ticket-42");
  });

  describe("mark all as read", () => {
    it("does not render when there are no unread notifications", async () => {
      mockApiGet([notification({ readAt: "2026-01-01T13:00:00.000Z" })], 0);
      renderBell();
      await waitFor(() => expect(apiClientMocks.get).toHaveBeenCalled());

      await openDropdown();

      expect(screen.queryByText("Mark all as read")).toBeNull();
    });

    it("calls the read-all endpoint when clicked", async () => {
      apiClientMocks.patch.mockResolvedValue({ data: { count: 1 } });
      mockApiGet([notification({})], 1);
      renderBell();
      await waitFor(() => expect(apiClientMocks.get).toHaveBeenCalled());
      await openDropdown();

      fireEvent.click(await screen.findByRole("menuitem", { name: "Mark all as read" }));

      await waitFor(() =>
        expect(apiClientMocks.patch).toHaveBeenCalledWith("/api/notifications/read-all")
      );
    });
  });

  // Regression coverage for the toast-storm bug fixed in this feature
  // (see error-log.txt's 2026-08-17 "notification-bell.tsx" entry): a
  // fresh load must seed silently, and only a notification that shows up
  // on a *later* refetch should ever toast.
  describe("toast flash", () => {
    it("does not toast for notifications already present on the first successful load", async () => {
      mockApiGet([notification({ id: "notif-1" }), notification({ id: "notif-2" })], 2);
      renderBell();

      // Wait for the badge to show the real count — a concrete signal
      // this render's data (and its effect) has actually landed, unlike
      // guessing at a fixed number of ticks.
      await screen.findByText("2");

      expect(toastMock).not.toHaveBeenCalled();
    });

    it("toasts once for a notification that appears on a later refetch, and invalidates its ticket's cache", async () => {
      mockApiGet([notification({ id: "notif-1", message: "Already seen" })], 1);
      const { queryClient } = renderBell();
      await screen.findByText("1");
      expect(toastMock).not.toHaveBeenCalled();

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      mockApiGet(
        [
          notification({ id: "notif-1", message: "Already seen" }),
          notification({ id: "notif-2", ticketId: "ticket-99", message: "Brand new reply" }),
        ],
        2
      );
      // Mirrors a real refetchInterval tick without the real 20s wait.
      // invalidateQueries() resolves once the refetch settles, but the
      // effect that calls toast() runs on the render after that — so
      // wait on the effect's own result (toastMock), not just the fetch.
      await act(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));

      expect(toastMock).toHaveBeenCalledWith("Brand new reply");
      // Implied by toHaveBeenCalledTimes(1) above, but stated directly:
      // an already-seen notification must never re-toast.
      expect(toastMock).not.toHaveBeenCalledWith("Already seen");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tickets"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ticket", "ticket-99"] });
    });
  });
});

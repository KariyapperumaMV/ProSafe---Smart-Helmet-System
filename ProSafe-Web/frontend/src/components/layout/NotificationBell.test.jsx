import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "./NotificationBell";
import { useNotificationContext } from "../../context/NotificationContext";

vi.mock("../../context/NotificationContext", () => ({
  useNotificationContext: vi.fn(),
}));

const notifications = [
  { id: "1", type: "EMERGENCY_ALERT", title: "Emergency activated", message: "Kasun pressed the button", read: false, createdAt: new Date().toISOString() },
  { id: "2", type: "USER_CREATED", title: "User created", message: "New worker added", read: true, createdAt: new Date().toISOString() },
];

function mockContext(overrides = {}) {
  useNotificationContext.mockReturnValue({
    notifications: [], unreadCount: 0, loading: false, lastEvent: null,
    markRead: vi.fn(), markAllRead: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  useNotificationContext.mockReset();
  mockContext();
});

describe("NotificationBell", () => {
  test("shows no badge when there are no unread notifications", () => {
    render(<NotificationBell />);
    expect(screen.queryByText(/\d/)).not.toBeInTheDocument();
  });

  test("shows the unread count badge", () => {
    mockContext({ notifications, unreadCount: 1 });
    render(<NotificationBell />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  test("caps the displayed badge at 99+", () => {
    mockContext({ notifications, unreadCount: 150 });
    render(<NotificationBell />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  test("opens the dropdown and lists notifications with title/message/time, unread ones marked", async () => {
    mockContext({ notifications, unreadCount: 1 });
    render(<NotificationBell />);

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(screen.getByText("Emergency activated")).toBeInTheDocument();
    expect(screen.getByText("Kasun pressed the button")).toBeInTheDocument();
    expect(screen.getByText("User created")).toBeInTheDocument();
  });

  test("shows an empty-state message when there are no notifications at all", async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  test("clicking a notification calls markRead with its id", async () => {
    const markRead = vi.fn();
    mockContext({ notifications, unreadCount: 1, markRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await userEvent.click(screen.getByText("Emergency activated"));

    expect(markRead).toHaveBeenCalledWith("1");
  });

  test("Mark all as read only appears when there's something unread, and calls markAllRead", async () => {
    const markAllRead = vi.fn();
    mockContext({ notifications, unreadCount: 1, markAllRead });
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    const markAllButton = screen.getByRole("button", { name: "Mark all as read" });
    await userEvent.click(markAllButton);
    expect(markAllRead).toHaveBeenCalled();
  });

  test("does not show Mark all as read when unreadCount is 0", async () => {
    mockContext({ notifications, unreadCount: 0 });
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
  });

  test("clicking outside closes the dropdown", async () => {
    mockContext({ notifications, unreadCount: 1 });
    render(
      <div>
        <NotificationBell />
        <button type="button">outside</button>
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Emergency activated")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByText("Emergency activated")).not.toBeInTheDocument();
  });
});

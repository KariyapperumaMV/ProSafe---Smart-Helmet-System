import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { SettingsPage } from "./SettingsPage";
import { getMe, updateMe } from "../api/userApi";
import { changePassword } from "../api/authApi";
import { getSystemInfo, getSiteSettings } from "../api/settingsApi";

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../api/userApi", async () => {
  const actual = await vi.importActual("../api/userApi");
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn() };
});
vi.mock("../api/authApi", () => ({ changePassword: vi.fn() }));
vi.mock("../api/settingsApi", () => ({ getSystemInfo: vi.fn(), getSiteSettings: vi.fn() }));

const workerProfile = {
  userId: "W-001", name: "Nirmani Silva", email: "nirmani@test.com", phone: "0771234567",
  address: "12 Galle Road", role: "WORKER", profileImageUrl: null,
  preferences: { notifications: { safetyAlerts: true, emergencyAlerts: true, emergencyResetUpdates: true, accountNotifications: true, reportNotifications: true } },
};
const adminProfile = {
  ...workerProfile, userId: "ADM-001", name: "Admin User", email: "admin@test.com", role: "ADMIN",
};

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </ToastProvider>
  );
}

let updateStoredUser;

beforeEach(() => {
  localStorage.clear();
  updateStoredUser = vi.fn();
  useAuth.mockReturnValue({ updateStoredUser });
  getMe.mockReset();
  updateMe.mockReset();
  changePassword.mockReset();
  getSystemInfo.mockReset();
  getSiteSettings.mockReset();
  getSystemInfo.mockResolvedValue({
    appName: "ProSafe Smart Helmet", role: "WORKER", userId: "W-001",
    timezone: "Asia/Colombo", apiStatus: "ok", mlServiceConfigured: true,
  });
});

describe("SettingsPage — loading/error", () => {
  test("shows a loading state before the profile arrives", () => {
    getMe.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading settings…")).toBeInTheDocument();
  });

  test("shows an error state when the profile fails to load", async () => {
    getMe.mockRejectedValue({ status: 500, message: "Internal server error" });
    renderPage();
    expect(await screen.findByText("Couldn't load your profile")).toBeInTheDocument();
  });
});

describe("SettingsPage — Account", () => {
  test("loads and the account form pre-populates from the fetched profile", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    renderPage();

    expect(await screen.findByDisplayValue("Nirmani Silva")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0771234567")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12 Galle Road")).toBeInTheDocument();
    expect(screen.getByDisplayValue("nirmani@test.com")).toBeDisabled(); // email read-only
    expect(screen.getByDisplayValue("W-001")).toBeDisabled(); // user id read-only
  });

  test("rejects an empty name client-side without calling the API", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    renderPage();
    const nameInput = await screen.findByDisplayValue("Nirmani Silva");

    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole("button", { name: "Save Account Changes" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(updateMe).not.toHaveBeenCalled();
  });

  test("saves account changes and updates AuthContext", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    const updated = { ...workerProfile, name: "Nirmani Updated" };
    updateMe.mockResolvedValue({ user: updated });
    renderPage();

    const nameInput = await screen.findByDisplayValue("Nirmani Silva");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Nirmani Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save Account Changes" }));

    await waitFor(() => expect(updateMe).toHaveBeenCalled());
    expect(updateStoredUser).toHaveBeenCalledWith(updated);
    expect(await screen.findByText("Settings updated successfully")).toBeInTheDocument();
  });

  test("a server-side validation error (e.g. bad phone) is shown on the field", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    updateMe.mockRejectedValue({ status: 400, message: "Validation failed", errors: { phone: "A valid phone number is required" } });
    renderPage();
    await screen.findByDisplayValue("Nirmani Silva");

    await userEvent.click(screen.getByRole("button", { name: "Save Account Changes" }));

    expect(await screen.findByText("A valid phone number is required")).toBeInTheDocument();
  });
});

describe("SettingsPage — Password", () => {
  // Regex, not exact strings: the Field component's `required` marker is a
  // sibling <span aria-hidden="true"> *</span> inside the <label>, and
  // getByLabelText computes the label's name from raw textContent (which
  // includes aria-hidden descendants) — so the true accessible text is
  // "Current Password *", not "Current Password" alone.
  async function fillPasswordForm(current, next, confirm) {
    await userEvent.type(screen.getByLabelText(/^Current Password/), current);
    await userEvent.type(screen.getByLabelText(/^New Password/), next);
    await userEvent.type(screen.getByLabelText(/^Confirm New Password/), confirm);
  }

  test("client-side validation: required fields and mismatch", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    renderPage();
    await screen.findByDisplayValue("Nirmani Silva");

    await userEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(await screen.findByText("Current password is required")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();

    await fillPasswordForm("OldPass1", "NewPass2", "Different3");
    await userEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  test("success clears all password fields and shows a success toast", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    changePassword.mockResolvedValue({ message: "Password changed successfully" });
    renderPage();
    await screen.findByDisplayValue("Nirmani Silva");

    await fillPasswordForm("OldPass1", "NewPass2", "NewPass2");
    await userEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByText("Password changed successfully")).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith("OldPass1", "NewPass2");
    expect(screen.getByLabelText(/^Current Password/)).toHaveValue("");
    expect(screen.getByLabelText(/^New Password/)).toHaveValue("");
    expect(screen.getByLabelText(/^Confirm New Password/)).toHaveValue("");
  });

  test("a wrong-current-password error is shown on the field, fields are not cleared", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    changePassword.mockRejectedValue({ status: 400, message: "Current password is incorrect" });
    renderPage();
    await screen.findByDisplayValue("Nirmani Silva");

    await fillPasswordForm("WrongOld1", "NewPass2", "NewPass2");
    await userEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Current Password/)).toHaveValue("WrongOld1");
  });
});

describe("SettingsPage — Notification preferences", () => {
  test("toggles reflect the loaded preferences and Save Preferences persists a change", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    updateMe.mockResolvedValue({ user: { ...workerProfile, preferences: { notifications: { ...workerProfile.preferences.notifications, safetyAlerts: false } } } });
    renderPage();
    await screen.findByDisplayValue("Nirmani Silva");

    const safetyToggle = screen.getByText("Safety Alerts").closest(".ps-toggle-row").querySelector("input");
    expect(safetyToggle.checked).toBe(true);

    await userEvent.click(safetyToggle);
    await userEvent.click(screen.getByRole("button", { name: "Save Preferences" }));

    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ notificationPreferences: expect.objectContaining({ safetyAlerts: false }) }));
    expect(await screen.findByText("Notification preferences updated")).toBeInTheDocument();
  });

  test("a WORKER's Emergency Alerts toggle is editable (not locked)", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    renderPage();
    await screen.findByDisplayValue("Nirmani Silva");

    const row = screen.getByText("Emergency Alerts").closest(".ps-toggle-row");
    const input = row.querySelector("input");
    expect(input).not.toBeDisabled();
    expect(within(row).queryByText("Always enabled for administrators")).not.toBeInTheDocument();
  });

  test("an ADMIN's Emergency Alerts toggle is locked on and shows the explanatory note", async () => {
    getMe.mockResolvedValue({ user: adminProfile });
    getSiteSettings.mockResolvedValue({ siteName: "Test Site", siteLatitude: 6.9, siteLongitude: 79.8, siteTimezone: "Asia/Colombo", helmetOfflineAfterSeconds: 180 });
    renderPage();
    await screen.findByDisplayValue("Admin User");

    const row = screen.getByText("Emergency Alerts").closest(".ps-toggle-row");
    const input = row.querySelector("input");
    expect(input).toBeDisabled();
    expect(input.checked).toBe(true);
    expect(within(row).getByText("Always enabled for administrators")).toBeInTheDocument();
  });
});

describe("SettingsPage — Appearance", () => {
  test("toggling compact mode applies immediately (no Save button) and survives remount", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    const { unmount } = renderPage();
    await screen.findByDisplayValue("Nirmani Silva");

    const compactInput = screen.getByText("Compact Mode").closest(".ps-toggle-row").querySelector("input");
    await userEvent.click(compactInput);
    expect(document.body.classList.contains("ps-compact")).toBe(true);

    unmount();
    renderPage();
    await screen.findByDisplayValue("Nirmani Silva");
    const compactInputAgain = screen.getByText("Compact Mode").closest(".ps-toggle-row").querySelector("input");
    expect(compactInputAgain.checked).toBe(true);
  });
});

describe("SettingsPage — Site Settings visibility (RBAC)", () => {
  test("ADMIN sees the Site Settings card", async () => {
    getMe.mockResolvedValue({ user: adminProfile });
    getSiteSettings.mockResolvedValue({ siteName: "Test Site", siteLatitude: 6.9, siteLongitude: 79.8, siteTimezone: "Asia/Colombo", helmetOfflineAfterSeconds: 180 });
    renderPage();

    expect(await screen.findByText("Site Settings")).toBeInTheDocument();
    expect(await screen.findByText("Test Site")).toBeInTheDocument();
    expect(getSiteSettings).toHaveBeenCalled();
  });

  test("WORKER does not see the Site Settings card, and it's never requested", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    renderPage();
    await screen.findByDisplayValue("Nirmani Silva");

    expect(screen.queryByText("Site Settings")).not.toBeInTheDocument();
    expect(getSiteSettings).not.toHaveBeenCalled();
  });
});

describe("SettingsPage — System Information", () => {
  test("shows 'Configured' wording, never 'Online', for the ML integration status", async () => {
    getMe.mockResolvedValue({ user: workerProfile });
    renderPage();

    expect(await screen.findByText("Configured")).toBeInTheDocument();
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
    expect(screen.queryByText(/ML Service: Online/)).not.toBeInTheDocument();
  });

  test("a failure loading Site Settings does not break the rest of the page for an ADMIN", async () => {
    getMe.mockResolvedValue({ user: adminProfile });
    getSiteSettings.mockRejectedValue({ status: 500, message: "Internal server error" });
    renderPage();

    expect(await screen.findByText("Couldn't load site settings")).toBeInTheDocument();
    // The rest of the page still works.
    expect(screen.getByText("System Information")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Admin User")).toBeInTheDocument();
  });
});

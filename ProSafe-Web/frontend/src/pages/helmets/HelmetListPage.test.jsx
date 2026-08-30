import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HelmetListPage } from "./HelmetListPage";
import { ToastProvider } from "../../context/ToastContext";
import { getHelmets, getHelmet, createHelmet, deleteHelmet } from "../../api/helmetApi";

vi.mock("../../api/helmetApi", () => ({
  getHelmets: vi.fn(),
  getHelmet: vi.fn(),
  createHelmet: vi.fn(),
  deleteHelmet: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <HelmetListPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

const baseResult = {
  helmets: [
    { helmetId: "PS-H-001", status: "ACTIVE", assigned: true, assignedTo: { userId: "W-015", name: "Nirmani Silva" }, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
    { helmetId: "PS-H-002", status: "ACTIVE", assigned: false, assignedTo: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
  ],
  pagination: { page: 1, limit: 10, total: 2, pages: 1 },
};

beforeEach(() => {
  getHelmets.mockReset();
  getHelmet.mockReset();
  createHelmet.mockReset();
  deleteHelmet.mockReset();
  getHelmets.mockResolvedValue(baseResult);
});

describe("HelmetListPage", () => {
  test("loads and renders the helmet list with assignment info", async () => {
    renderPage();

    const firstRowName = await screen.findByText("PS-H-001", {}, { timeout: 2000 });
    expect(firstRowName).toBeInTheDocument();
    expect(screen.getByText("PS-H-002")).toBeInTheDocument();
    expect(screen.getByText("Nirmani Silva")).toBeInTheDocument();

    // "Assigned"/"Unassigned" also label the filter pills, so scope to each
    // row's own badge rather than a bare screen.getByText.
    const firstRow = firstRowName.closest(".ps-user-row");
    expect(within(firstRow).getByText("Assigned")).toBeInTheDocument();
    const secondRow = screen.getByText("PS-H-002").closest(".ps-user-row");
    expect(within(secondRow).getByText("Unassigned")).toBeInTheDocument();
  });

  test("shows an empty state when there are no helmets", async () => {
    getHelmets.mockResolvedValue({ helmets: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 } });
    renderPage();
    expect(await screen.findByText("No helmets registered")).toBeInTheDocument();
  });

  test("typing in search debounces and calls the API with the search term", async () => {
    renderPage();
    await screen.findByText("PS-H-001");
    getHelmets.mockClear();

    await userEvent.type(screen.getByPlaceholderText(/search helmet id/i), "PS-H");

    await waitFor(() => expect(getHelmets).toHaveBeenCalledWith(expect.objectContaining({ search: "PS-H" })), {
      timeout: 1000,
    });
  });

  test("clicking the Assigned filter pill requests assignment=assigned", async () => {
    renderPage();
    await screen.findByText("PS-H-001");
    getHelmets.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Assigned" }));

    await waitFor(() => expect(getHelmets).toHaveBeenCalledWith(expect.objectContaining({ assignment: "assigned" })));
  });

  test("Add Helmet button opens the add modal", async () => {
    renderPage();
    await screen.findByText("PS-H-001");
    await userEvent.click(screen.getByRole("button", { name: "+ Add Helmet" }));
    expect(screen.getByRole("heading", { name: "Add Helmet" })).toBeInTheDocument();
  });

  test("adding a helmet successfully refreshes the list", async () => {
    createHelmet.mockResolvedValue({ helmet: { helmetId: "PS-H-005" } });
    renderPage();
    await screen.findByText("PS-H-001");

    await userEvent.click(screen.getByRole("button", { name: "+ Add Helmet" }));
    await userEvent.type(screen.getByLabelText(/Helmet ID/), "PS-H-005");
    getHelmets.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Add Helmet" }));

    await waitFor(() => expect(getHelmets).toHaveBeenCalled());
  });

  test("View opens the helmet details modal for the clicked helmet", async () => {
    getHelmet.mockResolvedValue({
      helmet: { helmetId: "PS-H-002", status: "ACTIVE", createdAt: "2026-08-01T00:00:00.000Z" },
      assigned: false, assignedTo: null, online: null, lastSeenAt: null, latestCommand: null, workerSafety: null,
    });
    renderPage();
    await screen.findByText("PS-H-002");

    const rows = screen.getAllByRole("button", { name: "View" });
    await userEvent.click(rows[1]); // PS-H-002 row

    expect(getHelmet).toHaveBeenCalledWith("PS-H-002");
    expect(await screen.findByText("Not assigned")).toBeInTheDocument();
  });

  test("Delete on an assigned helmet shows the blocked message, not a delete confirmation", async () => {
    renderPage();
    await screen.findByText("PS-H-001");

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await userEvent.click(deleteButtons[0]); // PS-H-001, assigned

    expect(screen.getByText("Cannot Delete Helmet")).toBeInTheDocument();
    expect(deleteHelmet).not.toHaveBeenCalled();
  });

  test("successfully deleting an unassigned helmet refreshes the list and shows a toast", async () => {
    deleteHelmet.mockResolvedValue({ message: "Helmet deleted successfully" });
    renderPage();
    await screen.findByText("PS-H-002");

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await userEvent.click(deleteButtons[1]); // PS-H-002, unassigned

    getHelmets.mockClear();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" })); // confirm inside modal

    await waitFor(() => expect(deleteHelmet).toHaveBeenCalledWith("PS-H-002"));
    expect(await screen.findByText("Helmet deleted successfully")).toBeInTheDocument();
    await waitFor(() => expect(getHelmets).toHaveBeenCalled());
  });
});

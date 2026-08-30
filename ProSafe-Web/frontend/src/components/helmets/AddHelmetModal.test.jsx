import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddHelmetModal } from "./AddHelmetModal";
import { createHelmet } from "../../api/helmetApi";
import { ToastProvider } from "../../context/ToastContext";

vi.mock("../../api/helmetApi", () => ({
  createHelmet: vi.fn(),
}));

beforeEach(() => {
  createHelmet.mockReset();
});

function renderModal(props) {
  return render(
    <ToastProvider>
      <AddHelmetModal open onClose={vi.fn()} onCreated={vi.fn()} {...props} />
    </ToastProvider>
  );
}

describe("AddHelmetModal", () => {
  test("shows a validation error instead of submitting when the field is empty", async () => {
    const onCreated = vi.fn();
    renderModal({ onCreated });

    await userEvent.click(screen.getByRole("button", { name: "Add Helmet" }));

    expect(await screen.findByText("Helmet ID is required")).toBeInTheDocument();
    expect(createHelmet).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  test("submits a valid helmet id, shows a toast, and calls onCreated", async () => {
    createHelmet.mockResolvedValue({ helmet: { helmetId: "PS-H-005" } });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderModal({ onCreated, onClose });

    await userEvent.type(screen.getByLabelText(/Helmet ID/), "PS-H-005");
    await userEvent.click(screen.getByRole("button", { name: "Add Helmet" }));

    await waitFor(() => expect(createHelmet).toHaveBeenCalledWith("PS-H-005"));
    expect(await screen.findByText("Helmet added successfully")).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("shows 'Helmet ID already exists' on a 409 without a generic toast", async () => {
    createHelmet.mockRejectedValue({ status: 409, message: "Helmet ID already exists" });
    renderModal();

    await userEvent.type(screen.getByLabelText(/Helmet ID/), "PS-H-DUP");
    await userEvent.click(screen.getByRole("button", { name: "Add Helmet" }));

    expect(await screen.findByText("Helmet ID already exists")).toBeInTheDocument();
  });

  test("rejects an invalid format before calling the API", async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText(/Helmet ID/), "a b");
    await userEvent.click(screen.getByRole("button", { name: "Add Helmet" }));

    expect(await screen.findByText(/letters, numbers, hyphen, underscore/i)).toBeInTheDocument();
    expect(createHelmet).not.toHaveBeenCalled();
  });
});

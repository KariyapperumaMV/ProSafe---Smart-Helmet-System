import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetEmergencyModal } from "./ResetEmergencyModal";
import { ToastProvider } from "../../context/ToastContext";
import { requestEmergencyReset } from "../../api/helmetApi";

vi.mock("../../api/helmetApi", () => ({
  requestEmergencyReset: vi.fn(),
}));

const alert = { id: "3", helmetId: "PS-H-3", workerName: "Priya Fernando" };

function renderModal(props) {
  return render(
    <ToastProvider>
      <ResetEmergencyModal open alert={alert} onClose={vi.fn()} onResetRequested={vi.fn()} {...props} />
    </ToastProvider>
  );
}

beforeEach(() => {
  requestEmergencyReset.mockReset();
});

describe("ResetEmergencyModal", () => {
  test("renders nothing when there's no alert", () => {
    render(
      <ToastProvider>
        <ResetEmergencyModal open alert={null} onClose={vi.fn()} />
      </ToastProvider>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("shows the worker's name in the confirmation copy", () => {
    renderModal();
    expect(screen.getByText(/Priya Fernando/)).toBeInTheDocument();
  });

  test("Cancel closes without calling the API", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(requestEmergencyReset).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("confirming requests a reset for the alert's helmetId and reports success", async () => {
    requestEmergencyReset.mockResolvedValue({ resetRequested: true, alreadyRequested: false });
    const onClose = vi.fn();
    const onResetRequested = vi.fn();
    renderModal({ onClose, onResetRequested });

    await userEvent.click(screen.getByRole("button", { name: "Reset Emergency" }));

    await waitFor(() => expect(requestEmergencyReset).toHaveBeenCalledWith("PS-H-3"));
    await waitFor(() => expect(onResetRequested).toHaveBeenCalledWith("3"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText("Reset requested — waiting for the helmet to confirm.")).toBeInTheDocument();
  });

  test("a failed reset request shows an error and does not close the modal", async () => {
    requestEmergencyReset.mockRejectedValue({ message: "Cannot request reset" });
    const onClose = vi.fn();
    renderModal({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Reset Emergency" }));

    expect(await screen.findByText("Cannot request reset")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteHelmetModal } from "./DeleteHelmetModal";

describe("DeleteHelmetModal", () => {
  test("unassigned helmet: shows the standard confirmation with Cancel/Delete", async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteHelmetModal
        open
        helmet={{ helmetId: "PS-H-001", assigned: false }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Delete Helmet?")).toBeInTheDocument();
    expect(screen.getByText(/PS-H-001/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("assigned helmet: blocks deletion, shows the worker's name, and offers no Delete button", () => {
    render(
      <DeleteHelmetModal
        open
        helmet={{ helmetId: "PS-H-001", assigned: true, assignedTo: { name: "Nirmani Silva" } }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("Cannot Delete Helmet")).toBeInTheDocument();
    expect(screen.getByText(/Nirmani Silva/)).toBeInTheDocument();
    expect(screen.getByText(/unassign it before deleting/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("calls onCancel when Close/Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <DeleteHelmetModal open helmet={{ helmetId: "PS-H-001", assigned: false }} onCancel={onCancel} onConfirm={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

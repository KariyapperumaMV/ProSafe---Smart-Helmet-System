import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteUserModal } from "./DeleteUserModal";

describe("DeleteUserModal", () => {
  test("renders nothing when closed", () => {
    render(<DeleteUserModal open={false} user={{ name: "Kasun" }} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByText("Delete User?")).not.toBeInTheDocument();
  });

  test("shows the user's name in the confirmation copy when open", () => {
    render(<DeleteUserModal open user={{ name: "Kasun Perera" }} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("Delete User?")).toBeInTheDocument();
    expect(screen.getByText(/Kasun Perera/)).toBeInTheDocument();
  });

  test("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<DeleteUserModal open user={{ name: "Kasun" }} onCancel={onCancel} onConfirm={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("calls onConfirm when Delete is clicked", async () => {
    const onConfirm = vi.fn();
    render(<DeleteUserModal open user={{ name: "Kasun" }} onCancel={vi.fn()} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("disables the buttons while deleting", () => {
    render(<DeleteUserModal open user={{ name: "Kasun" }} onCancel={vi.fn()} onConfirm={vi.fn()} deleting />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

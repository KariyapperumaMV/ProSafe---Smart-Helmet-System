import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserForm } from "./UserForm";
import { getAssignableHelmets } from "../../api/helmetApi";

vi.mock("../../api/helmetApi", () => ({
  getAssignableHelmets: vi.fn(),
}));

beforeEach(() => {
  getAssignableHelmets.mockResolvedValue([{ helmetId: "PS-H-001" }, { helmetId: "PS-H-002" }]);
});

describe("UserForm (add mode)", () => {
  test("shows validation errors instead of submitting when required fields are empty", async () => {
    const onSubmit = vi.fn();
    render(<UserForm mode="add" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Add User" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("submits with valid data", async () => {
    const onSubmit = vi.fn();
    render(<UserForm mode="add" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/Name/), "Jane Doe");
    await userEvent.type(screen.getByLabelText(/Email/), "jane@example.com");
    await userEvent.type(screen.getByLabelText(/NIC/), "985654321V");
    await userEvent.type(screen.getByLabelText(/Phone No/), "0771234567");
    await userEvent.type(screen.getByLabelText(/Password/), "Passw0rd1");

    await userEvent.click(screen.getByRole("button", { name: "Add User" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Jane Doe", email: "jane@example.com" });
  });

  test("hides the Helmet field once Type is switched to Admin", async () => {
    render(<UserForm mode="add" onSubmit={vi.fn()} />);

    // Worker is the default — helmet field is present.
    expect(await screen.findByLabelText("Helmet")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/Type/), "ADMIN");

    expect(screen.queryByLabelText("Helmet")).not.toBeInTheDocument();
  });
});

describe("UserForm (edit mode)", () => {
  test("allows submitting with an empty password (kept unchanged)", async () => {
    const onSubmit = vi.fn();
    render(
      <UserForm
        mode="edit"
        userId="W-001"
        initialValues={{
          name: "Jane Doe",
          email: "jane@example.com",
          nic: "985654321V",
          phone: "0771234567",
          role: "WORKER",
          address: "",
          helmetId: null,
        }}
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Update User" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test("shows the read-only User ID field", () => {
    render(
      <UserForm
        mode="edit"
        userId="W-001"
        initialValues={{ name: "Jane", email: "jane@example.com", nic: "985654321V", phone: "0771234567", role: "WORKER" }}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("W-001")).toBeDisabled();
  });
});

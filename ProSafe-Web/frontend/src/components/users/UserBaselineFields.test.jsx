import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserForm } from "./UserForm";
import { getAssignableHelmets } from "../../api/helmetApi";
import { validateBaselines, validateUserForm } from "../../utils/validators";

vi.mock("../../api/helmetApi", () => ({
  getAssignableHelmets: vi.fn(),
}));

beforeEach(() => {
  getAssignableHelmets.mockResolvedValue([{ helmetId: "PS-H-001" }]);
});

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(/^Name/), "Jane Doe");
  await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
  await userEvent.type(screen.getByLabelText(/^NIC/), "985654321V");
  await userEvent.type(screen.getByLabelText(/Phone No/), "0771234567");
  await userEvent.type(screen.getByLabelText(/^Password/), "Passw0rd1");
}

describe("UserForm worker baselines", () => {
  test("baseline inputs are shown for Worker and hidden for Admin", async () => {
    render(<UserForm mode="add" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/Baseline Heart Rate/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Baseline Body Temperature/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/^Type/), "ADMIN");
    expect(screen.queryByLabelText(/Baseline Heart Rate/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Baseline Body Temperature/)).not.toBeInTheDocument();
  });

  test("submits entered baselines with the worker", async () => {
    const onSubmit = vi.fn();
    render(<UserForm mode="add" onSubmit={onSubmit} />);
    await fillRequired();
    await userEvent.type(screen.getByLabelText(/Baseline Heart Rate/), "72");
    await userEvent.type(screen.getByLabelText(/Baseline Body Temperature/), "36.6");
    await userEvent.click(screen.getByRole("button", { name: "Add User" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ baselineHeartRate: "72", baselineBodyTemperature: "36.6" });
  });

  test("blocks submission when only one baseline is entered or a value is out of range", async () => {
    const onSubmit = vi.fn();
    render(<UserForm mode="add" onSubmit={onSubmit} />);
    await fillRequired();
    await userEvent.type(screen.getByLabelText(/Baseline Heart Rate/), "72");
    await userEvent.click(screen.getByRole("button", { name: "Add User" }));
    expect(await screen.findByText("Enter both baselines, or leave both empty")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Baseline Body Temperature/), "50");
    await userEvent.click(screen.getByRole("button", { name: "Add User" }));
    expect(await screen.findByText("Must be between 30 and 43 °C")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("edit mode pre-fills stored baselines and switching to Admin clears them", async () => {
    const onSubmit = vi.fn();
    render(
      <UserForm
        mode="edit"
        userId="W-001"
        initialValues={{ name: "Jane Doe", email: "jane@example.com", nic: "985654321V", phone: "0771234567", role: "WORKER", address: "", helmetId: null, baselineHeartRate: 68, baselineBodyTemperature: 36.4 }}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByLabelText(/Baseline Heart Rate/)).toHaveValue(68);
    expect(screen.getByLabelText(/Baseline Body Temperature/)).toHaveValue(36.4);

    await userEvent.selectOptions(screen.getByLabelText(/^Type/), "ADMIN");
    await userEvent.click(screen.getByRole("button", { name: "Update User" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ role: "ADMIN", baselineHeartRate: "", baselineBodyTemperature: "" });
  });

  test("an existing worker without baselines can still be edited (both empty is valid)", async () => {
    const onSubmit = vi.fn();
    render(
      <UserForm
        mode="edit"
        userId="W-002"
        initialValues={{ name: "Legacy", email: "legacy@example.com", nic: "985654322V", phone: "0771234567", role: "WORKER", address: "", helmetId: null, baselineHeartRate: null, baselineBodyTemperature: null }}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByLabelText(/Baseline Heart Rate/)).toHaveValue(null);
    await userEvent.click(screen.getByRole("button", { name: "Update User" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});

describe("validateBaselines", () => {
  test("both or neither, numeric, within range", () => {
    expect(validateBaselines({ baselineHeartRate: "", baselineBodyTemperature: "" })).toEqual({});
    expect(validateBaselines({ baselineHeartRate: "72", baselineBodyTemperature: "36.6" })).toEqual({});
    expect(validateBaselines({ baselineHeartRate: "72", baselineBodyTemperature: "" })).toHaveProperty("baselineBodyTemperature");
    expect(validateBaselines({ baselineHeartRate: "", baselineBodyTemperature: "36.6" })).toHaveProperty("baselineHeartRate");
    expect(validateBaselines({ baselineHeartRate: "300", baselineBodyTemperature: "36.6" })).toHaveProperty("baselineHeartRate");
    expect(validateBaselines({ baselineHeartRate: "abc", baselineBodyTemperature: "36.6" })).toHaveProperty("baselineHeartRate");
  });

  test("admins are never validated for baselines", () => {
    const base = { name: "A", email: "a@b.co", nic: "985654321V", phone: "0771234567", role: "ADMIN", password: "Passw0rd1" };
    expect(validateUserForm({ ...base, baselineHeartRate: "72" })).toEqual({});
  });
});

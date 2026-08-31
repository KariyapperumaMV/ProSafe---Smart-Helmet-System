import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserDetailView } from "./UserDetailView";

// Shallow-mock the three sensor modals: this test is about which modal gets
// opened with which props when a card is clicked, not the modals' own
// internals (those have their own test files).
vi.mock("./sensors/PersonalizedSensorModal", () => ({
  PersonalizedSensorModal: ({ open, userId, sensor }) =>
    open ? <div data-testid="personalized-modal">{`${userId}:${sensor}`}</div> : null,
}));
vi.mock("./sensors/EnvironmentalSensorModal", () => ({
  EnvironmentalSensorModal: ({ open, userId, sensor }) =>
    open ? <div data-testid="environmental-modal">{`${userId}:${sensor}`}</div> : null,
}));
vi.mock("./sensors/SafetyPredictionModal", () => ({
  SafetyPredictionModal: ({ open, userId }) => (open ? <div data-testid="prediction-modal">{userId}</div> : null),
}));
// The guidance card polls a live endpoint and the location card renders a
// Leaflet map — neither is relevant to "which modal opens on which click"
// (this file's concern), so both are shallow-mocked, same approach as the
// three sensor modals above.
vi.mock("./CurrentConditionCard", () => ({
  CurrentConditionCard: ({ userId }) => <div data-testid="guidance-card">{userId}</div>,
}));
vi.mock("./WorkerLocationCompactCard", () => ({
  WorkerLocationCompactCard: ({ userId }) => <div data-testid="location-card">{userId}</div>,
}));

const workerData = {
  user: {
    userId: "W-042",
    name: "Nirmani Silva",
    email: "nirmani@example.com",
    phone: "0771112222",
    nic: "985654321V",
    address: "Colombo",
    role: "WORKER",
    helmetId: "PS-H-001",
    profileImageUrl: null,
  },
  currentRiskState: "SAFE",
  emergencyActive: false,
  latestSensorData: {
    timestamp: "2026-08-30T09:45:00.000Z",
    sensors: { heartRate: 92, bodyTemp: 36.8, ambientTemp: 34, noise: 83, gas: 120, uv: 5 },
  },
};

describe("UserDetailView — sensor cards open the correct modal", () => {
  test("clicking Heart Rate opens the personalized modal for heartRate, scoped to this worker's id", async () => {
    render(<UserDetailView data={workerData} />);
    await userEvent.click(screen.getByRole("button", { name: /heart rate/i }));
    expect(screen.getByTestId("personalized-modal")).toHaveTextContent("W-042:heartRate");
  });

  test("clicking Body Temperature opens the personalized modal for bodyTemperature", async () => {
    render(<UserDetailView data={workerData} />);
    await userEvent.click(screen.getByRole("button", { name: /body temperature/i }));
    expect(screen.getByTestId("personalized-modal")).toHaveTextContent("W-042:bodyTemperature");
  });

  test("clicking Noise opens the environmental modal for noise", async () => {
    render(<UserDetailView data={workerData} />);
    await userEvent.click(screen.getByRole("button", { name: /noise/i }));
    expect(screen.getByTestId("environmental-modal")).toHaveTextContent("W-042:noise");
  });

  test("clicking Gas opens the environmental modal for gas", async () => {
    render(<UserDetailView data={workerData} />);
    await userEvent.click(screen.getByRole("button", { name: /gas/i }));
    expect(screen.getByTestId("environmental-modal")).toHaveTextContent("W-042:gas");
  });

  test("clicking UV Light opens the environmental modal for uv", async () => {
    render(<UserDetailView data={workerData} />);
    await userEvent.click(screen.getByRole("button", { name: /uv light/i }));
    expect(screen.getByTestId("environmental-modal")).toHaveTextContent("W-042:uv");
  });

  test("clicking Ambient Temp opens the environmental modal for ambientTemperature", async () => {
    render(<UserDetailView data={workerData} />);
    await userEvent.click(screen.getByRole("button", { name: /ambient temp/i }));
    expect(screen.getByTestId("environmental-modal")).toHaveTextContent("W-042:ambientTemperature");
  });

  test("clicking the risk status badge opens the safety prediction modal for this worker", async () => {
    render(<UserDetailView data={workerData} />);
    await userEvent.click(screen.getByRole("button", { name: /view safety prediction history/i }));
    expect(screen.getByTestId("prediction-modal")).toHaveTextContent("W-042");
  });

  test("no sensor cards or modals render for an ADMIN user", () => {
    const adminData = { ...workerData, user: { ...workerData.user, role: "ADMIN", helmetId: null } };
    render(<UserDetailView data={adminData} />);
    expect(screen.queryByRole("button", { name: /heart rate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view safety prediction history/i })).not.toBeInTheDocument();
  });
});

describe("UserDetailView — sensor readings, location, and guidance layout", () => {
  test("all 6 sensor cards render inside the Sensor Readings card and remain clickable", () => {
    render(<UserDetailView data={workerData} />);
    for (const name of [/heart rate/i, /body temperature/i, /ambient temp/i, /noise/i, /gas/i, /uv light/i]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  test("the compact location card and the guidance card both render for a worker with a helmet", () => {
    render(<UserDetailView data={workerData} />);
    expect(screen.getByTestId("location-card")).toHaveTextContent("W-042");
    expect(screen.getByTestId("guidance-card")).toHaveTextContent("W-042");
  });

  test("readings label reflects online/offline state", () => {
    const offlineData = { ...workerData, online: false };
    render(<UserDetailView data={offlineData} />);
    expect(screen.getByText(/Last known readings/)).toBeInTheDocument();
  });

  test("neither location nor guidance card renders for an ADMIN user", () => {
    const adminData = { ...workerData, user: { ...workerData.user, role: "ADMIN", helmetId: null } };
    render(<UserDetailView data={adminData} />);
    expect(screen.queryByTestId("location-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("guidance-card")).not.toBeInTheDocument();
  });

  test("guidance card still mounts for a WORKER with no helmet — backend's NO_HELMET copy is the source of truth, not swallowed by a page-level empty state", () => {
    const noHelmetData = { ...workerData, user: { ...workerData.user, helmetId: null }, latestSensorData: null, currentRiskState: null };
    render(<UserDetailView data={noHelmetData} />);
    expect(screen.getByText("No helmet assigned")).toBeInTheDocument(); // page-level empty state
    expect(screen.getByTestId("guidance-card")).toHaveTextContent("W-042"); // guidance still mounts
    expect(screen.queryByTestId("location-card")).not.toBeInTheDocument(); // nothing to show without a helmet
  });

  test("guidance card still mounts for a WORKER whose helmet has never sent a packet", () => {
    const noDataData = { ...workerData, latestSensorData: null };
    render(<UserDetailView data={noDataData} />);
    expect(screen.getByText("Helmet offline")).toBeInTheDocument();
    expect(screen.getByTestId("guidance-card")).toHaveTextContent("W-042");
    expect(screen.queryByTestId("location-card")).not.toBeInTheDocument();
  });
});

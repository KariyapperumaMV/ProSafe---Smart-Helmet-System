import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("./dashboard/AdminDashboard", () => ({ AdminDashboard: () => <div>Admin Dashboard Rendered</div> }));
vi.mock("./dashboard/WorkerDashboard", () => ({ WorkerDashboard: () => <div>Worker Dashboard Rendered</div> }));

describe("DashboardPage — role-based rendering", () => {
  test("ADMIN renders AdminDashboard", () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN" } });
    render(<DashboardPage />);
    expect(screen.getByText("Admin Dashboard Rendered")).toBeInTheDocument();
    expect(screen.queryByText("Worker Dashboard Rendered")).not.toBeInTheDocument();
  });

  test("WORKER renders WorkerDashboard", () => {
    useAuth.mockReturnValue({ user: { role: "WORKER" } });
    render(<DashboardPage />);
    expect(screen.getByText("Worker Dashboard Rendered")).toBeInTheDocument();
    expect(screen.queryByText("Admin Dashboard Rendered")).not.toBeInTheDocument();
  });
});

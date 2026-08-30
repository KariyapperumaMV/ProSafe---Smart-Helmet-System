import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoleRoute } from "./RoleRoute";
import { useAuth } from "../../context/AuthContext";

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function renderWithRole(role) {
  useAuth.mockReturnValue({ user: role ? { role } : null });

  return render(
    <MemoryRouter initialEntries={["/users"]}>
      <Routes>
        <Route element={<RoleRoute allow={["ADMIN"]} />}>
          <Route path="/users" element={<div>Users Page</div>} />
        </Route>
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RoleRoute", () => {
  test("renders the protected page for an allowed role", () => {
    renderWithRole("ADMIN");
    expect(screen.getByText("Users Page")).toBeInTheDocument();
  });

  test("redirects a disallowed role (worker) to /dashboard", () => {
    renderWithRole("WORKER");
    expect(screen.getByText("Dashboard Page")).toBeInTheDocument();
    expect(screen.queryByText("Users Page")).not.toBeInTheDocument();
  });

  test("redirects when there is no user at all", () => {
    renderWithRole(null);
    expect(screen.getByText("Dashboard Page")).toBeInTheDocument();
  });
});

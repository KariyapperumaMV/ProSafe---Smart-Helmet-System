import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "../../context/AuthContext";

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function renderWithAuth(isAuthenticated) {
  useAuth.mockReturnValue({ isAuthenticated });

  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  test("renders the page when authenticated", () => {
    renderWithAuth(true);
    expect(screen.getByText("Dashboard Page")).toBeInTheDocument();
  });

  test("redirects to /login when not authenticated", () => {
    renderWithAuth(false);
    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Page")).not.toBeInTheDocument();
  });
});

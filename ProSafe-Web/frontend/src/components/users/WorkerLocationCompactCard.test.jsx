import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkerLocationCompactCard } from "./WorkerLocationCompactCard";

// This file is about the compact card's own footer text and link — marker/
// tile/fit behavior belongs to WorkerLocationMap.test.jsx, so the map is
// shallow-mocked here (same approach AdminDashboard.test.jsx uses).
vi.mock("../dashboard/WorkerLocationMap", () => ({
  WorkerLocationMap: ({ locations, compact, emptyTitle, emptyDescription }) =>
    locations.length ? (
      <div data-testid="mock-map" data-compact={String(compact)}>
        {locations.length} pin(s)
      </div>
    ) : (
      <div data-testid="mock-map-empty">
        {emptyTitle} / {emptyDescription}
      </div>
    ),
}));

describe("WorkerLocationCompactCard", () => {
  test("no valid GPS ever received -> empty state, never a fabricated map", () => {
    render(<WorkerLocationCompactCard userId="W-001" workerName="Nirmani Silva" helmetId="PS-H-1" online={false} lastSeenAt={null} location={null} />);

    expect(screen.getByTestId("mock-map-empty")).toHaveTextContent("Location unavailable");
    expect(screen.getByTestId("mock-map-empty")).toHaveTextContent("No valid GPS location has been received from this helmet.");
    expect(screen.queryByText(/Open in Google Maps/)).not.toBeInTheDocument();
  });

  test("online worker: current location wording, map rendered compact, Google Maps link present", () => {
    const now = new Date().toISOString();
    render(
      <WorkerLocationCompactCard
        userId="W-001"
        workerName="Nirmani Silva"
        helmetId="PS-H-1"
        online={true}
        lastSeenAt={now}
        location={{ lat: 6.9271, lon: 79.8612, locationTimestamp: now }}
      />
    );

    expect(screen.getByTestId("mock-map")).toHaveAttribute("data-compact", "true");
    expect(screen.getByText(/Helmet online/)).toBeInTheDocument();
    expect(screen.getByText(/Current location/)).toBeInTheDocument();
    expect(screen.getByText("Helmet: PS-H-1")).toBeInTheDocument();
    const link = screen.getByText(/Open in Google Maps/);
    expect(link.closest("a")).toHaveAttribute("href", "https://www.google.com/maps?q=6.9271,79.8612");
  });

  test("offline worker: 'last known location' wording, textual online/offline state (never color-only)", () => {
    const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    render(
      <WorkerLocationCompactCard
        userId="W-001"
        workerName="Nirmani Silva"
        helmetId="PS-H-1"
        online={false}
        lastSeenAt={oldTime}
        location={{ lat: 6.9271, lon: 79.8612, locationTimestamp: oldTime }}
      />
    );

    expect(screen.getByText(/Helmet offline/)).toBeInTheDocument();
    expect(screen.getByText(/Last known location/)).toBeInTheDocument();
  });

  test("shows a separate 'helmet last seen' line only when it differs from the GPS fix's own timestamp", () => {
    const locationTime = new Date(Date.now() - 18 * 60 * 1000).toISOString();
    const lastSeenTime = new Date(Date.now() - 12 * 60 * 1000).toISOString();
    render(
      <WorkerLocationCompactCard
        userId="W-001"
        workerName="Nirmani Silva"
        helmetId="PS-H-1"
        online={false}
        lastSeenAt={lastSeenTime}
        location={{ lat: 6.9271, lon: 79.8612, locationTimestamp: locationTime }}
      />
    );

    expect(screen.getByText(/Helmet last seen/)).toBeInTheDocument();
  });

  test("does not show a separate 'helmet last seen' line when the timestamps match", () => {
    const same = new Date().toISOString();
    render(
      <WorkerLocationCompactCard
        userId="W-001"
        workerName="Nirmani Silva"
        helmetId="PS-H-1"
        online={true}
        lastSeenAt={same}
        location={{ lat: 6.9271, lon: 79.8612, locationTimestamp: same }}
      />
    );

    expect(screen.queryByText(/Helmet last seen/)).not.toBeInTheDocument();
  });
});

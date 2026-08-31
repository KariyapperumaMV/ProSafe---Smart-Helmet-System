import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkerLocationMap } from "./WorkerLocationMap";

// Leaflet manipulates real layout/DOM measurement that jsdom doesn't provide
// — fitBounds/setView logic is exercised directly against react-leaflet's
// real behavior only in a browser. Here we stub react-leaflet with simple
// stand-ins that record what WorkerLocationMap fed them, and assert on the
// data-driven decisions the component itself makes (which pins, what text).
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, center }) => (
    <div data-testid="map-container" data-center={JSON.stringify(center)}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children, position }) => (
    <div data-testid="marker" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));
vi.mock("leaflet", () => ({
  default: {
    divIcon: vi.fn(() => "mock-icon"),
    latLngBounds: vi.fn(() => "mock-bounds"),
  },
}));

const online = {
  userId: "W-001", workerName: "Nirmani Silva", helmetId: "PS-H-1",
  lat: 6.9, lon: 79.8, online: true,
  lastSeenAt: new Date().toISOString(), locationTimestamp: new Date().toISOString(),
  operationalState: "SAFE",
};
const offline = {
  userId: "W-002", workerName: "Kasun Perera", helmetId: "PS-H-2",
  lat: 6.95, lon: 79.85, online: false,
  lastSeenAt: new Date(Date.now() - 3600_000).toISOString(),
  locationTimestamp: new Date(Date.now() - 3600_000).toISOString(),
  operationalState: "WARNING",
};

describe("WorkerLocationMap", () => {
  test("shows the empty state when there are no locations — never a fabricated default center", () => {
    render(<WorkerLocationMap locations={[]} />);
    expect(screen.getByText("No worker locations yet")).toBeInTheDocument();
    expect(screen.queryByTestId("map-container")).not.toBeInTheDocument();
  });

  test("centers on the single worker when there's exactly one", () => {
    render(<WorkerLocationMap locations={[online]} />);
    const container = screen.getByTestId("map-container");
    expect(JSON.parse(container.dataset.center)).toEqual([6.9, 79.8]);
  });

  test("renders one marker per location, at the correct coordinates", () => {
    render(<WorkerLocationMap locations={[online, offline]} />);
    const markers = screen.getAllByTestId("marker");
    expect(markers).toHaveLength(2);
    expect(JSON.parse(markers[0].dataset.position)).toEqual([6.9, 79.8]);
    expect(JSON.parse(markers[1].dataset.position)).toEqual([6.95, 79.85]);
  });

  test("an offline worker's popup says 'last known location', never implying current presence", () => {
    render(<WorkerLocationMap locations={[offline]} />);
    expect(screen.getByText("Last known location")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  test("an online worker's popup says 'current location'", () => {
    render(<WorkerLocationMap locations={[online]} />);
    expect(screen.getByText("Current location")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  test("popup shows the worker name and helmet id", () => {
    render(<WorkerLocationMap locations={[online]} />);
    expect(screen.getByText("Nirmani Silva")).toBeInTheDocument();
    expect(screen.getByText("Helmet PS-H-1")).toBeInTheDocument();
  });
});

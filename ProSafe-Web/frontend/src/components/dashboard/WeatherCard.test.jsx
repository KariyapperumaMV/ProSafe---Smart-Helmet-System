import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeatherCard } from "./WeatherCard";

describe("WeatherCard", () => {
  test("renders temperature, condition, and detail fields when available", () => {
    render(
      <WeatherCard
        weather={{
          available: true,
          timezone: "Asia/Colombo",
          temperature: 32,
          temperatureUnit: "°C",
          apparentTemperature: 35,
          condition: "Partly cloudy",
          humidity: 54,
          humidityUnit: "%",
          windSpeed: 10,
          windSpeedUnit: "km/h",
        }}
      />
    );

    expect(screen.getByText("32°C")).toBeInTheDocument();
    expect(screen.getByText("Partly cloudy")).toBeInTheDocument();
    expect(screen.getByText("54% humidity")).toBeInTheDocument();
    expect(screen.getByText("10 km/h wind")).toBeInTheDocument();
  });

  test("renders an unavailable state without crashing when weather is unavailable", () => {
    render(<WeatherCard weather={{ available: false }} />);
    expect(screen.getByText("Weather unavailable")).toBeInTheDocument();
  });

  test("renders an unavailable state when weather is undefined entirely", () => {
    render(<WeatherCard weather={undefined} />);
    expect(screen.getByText("Weather unavailable")).toBeInTheDocument();
  });
});

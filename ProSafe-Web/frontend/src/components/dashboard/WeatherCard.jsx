import { useEffect, useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";

// Ticks independently of the weather fetch — the clock stays live even
// when weather itself is unavailable. Uses the site's own timezone
// (echoed back by the backend on a successful fetch) so admins reviewing
// from elsewhere still see the site's local time, falling back to the
// viewer's browser timezone only when weather couldn't be loaded at all.
function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function WeatherCard({ weather }) {
  const now = useLiveClock();
  const timeZone = weather?.timezone;
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone });
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone });

  if (!weather?.available) {
    return (
      <GlassCard className="ps-weather-card">
        <div className="ps-weather-time">
          <span className="ps-weather-clock">{timeStr}</span>
          <span className="ps-weather-date">{dateStr}</span>
        </div>
        <EmptyState icon="🌤" title="Weather unavailable" description="Site weather could not be loaded right now." />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="ps-weather-card">
      <div className="ps-weather-time">
        <span className="ps-weather-clock">{timeStr}</span>
        <span className="ps-weather-date">{dateStr}</span>
      </div>

      <div className="ps-weather-main">
        <span className="ps-weather-temp">
          {Math.round(weather.temperature)}
          {weather.temperatureUnit}
        </span>
        {weather.condition && <span className="ps-weather-condition">{weather.condition}</span>}
      </div>

      <div className="ps-weather-details">
        {weather.apparentTemperature !== null && (
          <span>
            Feels like {Math.round(weather.apparentTemperature)}
            {weather.temperatureUnit}
          </span>
        )}
        {weather.humidity !== null && (
          <span>
            {weather.humidity}
            {weather.humidityUnit} humidity
          </span>
        )}
        {weather.windSpeed !== null && (
          <span>
            {weather.windSpeed} {weather.windSpeedUnit} wind
          </span>
        )}
      </div>
    </GlassCard>
  );
}

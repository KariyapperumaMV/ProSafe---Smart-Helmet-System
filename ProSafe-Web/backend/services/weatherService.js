const { siteLatitude, siteLongitude, siteTimezone } = require("../config/appConfig");

// Open-Meteo — free, no API key. One site-wide location (never a worker's
// GPS), fetched server-side and cached so the browser never calls a third
// party directly and dashboards don't hammer it every poll.
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

let cache = { data: null, fetchedAt: 0 };

// WMO weather codes (Open-Meteo's `weather_code`) — common subset. An
// unmapped code still returns a label rather than silently showing nothing.
const WEATHER_CODE_LABELS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

function describeWeatherCode(code) {
  if (typeof code !== "number") return null;
  return WEATHER_CODE_LABELS[code] || `Weather code ${code}`;
}

async function fetchFromOpenMeteo() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", siteLatitude);
  url.searchParams.set("longitude", siteLongitude);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
  );
  url.searchParams.set("timezone", siteTimezone);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const body = await response.json();
    const current = body?.current;
    const units = body?.current_units || {};
    if (!current || typeof current.temperature_2m !== "number") return null;

    return {
      available: true,
      time: current.time || null,
      timezone: body.timezone || siteTimezone,
      temperature: current.temperature_2m,
      temperatureUnit: units.temperature_2m || "°C",
      apparentTemperature: typeof current.apparent_temperature === "number" ? current.apparent_temperature : null,
      condition: describeWeatherCode(current.weather_code),
      humidity: typeof current.relative_humidity_2m === "number" ? current.relative_humidity_2m : null,
      humidityUnit: units.relative_humidity_2m || "%",
      windSpeed: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
      windSpeedUnit: units.wind_speed_10m || "km/h",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Never throws — a weather failure must not take down the rest of the
// dashboard (#18). Site coordinates missing/invalid -> unavailable, same as
// any other fetch failure, since there's nothing honest to show either way.
async function getWeather() {
  if (typeof siteLatitude !== "number" || typeof siteLongitude !== "number" || Number.isNaN(siteLatitude) || Number.isNaN(siteLongitude)) {
    return { available: false };
  }

  if (cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const result = await fetchFromOpenMeteo();
  const data = result || { available: false };

  // Only cache a successful fetch — a transient failure should retry on the
  // next call rather than being pinned as "unavailable" for 10 minutes.
  if (result) {
    cache = { data, fetchedAt: Date.now() };
  }

  return data;
}

function clearWeatherCache() {
  cache = { data: null, fetchedAt: 0 };
}

module.exports = { getWeather, clearWeatherCache };

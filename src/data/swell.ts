/**
 * Swell and surf forecast data fetching.
 *
 * Fallback chain:
 * 1. Willyweather API (paid, best Australian coastal data)
 * 2. Open-Meteo Marine API (free, no key, global coverage, has forecasts)
 * 3. BOM wave buoy (free, observations only — no forecast)
 * 4. Mock data (offline/demo mode)
 *
 * Provides: current swell (height, period, direction), forecast,
 * trend, and secondary swell info.
 */

import { cachedFetch, TTL } from "./cache";

// --- Types ---

export interface SwellReading {
  timestamp: string;
  height: number; // metres
  period: number; // seconds
  direction: string; // e.g. "SSE", "E"
  directionDeg: number;
}

export interface SwellForecastPoint {
  timestamp: string;
  height: number;
  period: number;
  direction: string;
  directionDeg: number;
}

export interface WindForecastPoint {
  timestamp: string;
  speed: number; // knots
  gust: number;
  direction: string;
  directionDeg: number;
}

export interface WeatherForecastPoint {
  timestamp: string;
  precis: string; // e.g. "Showers", "Cloudy", "Mostly Sunny"
  rainProbability?: number; // 0-100
}

export interface SwellConditions {
  current: SwellReading;
  secondary: SwellReading | null;
  trend: "building" | "holding" | "dropping";
  forecast: SwellForecastPoint[];
  windForecast: WindForecastPoint[];
  weatherForecast: WeatherForecastPoint[];
  source: "willyweather" | "open-meteo" | "bom-buoy" | "unavailable";
  fetchedAt: string;
}

// --- Willyweather config ---

// Long Reef location ID on Willyweather (Northern Beaches reference)
const WILLYWEATHER_LOCATION_ID = "30089"; // Long Reef Beach, Sydney, NSW
const WILLYWEATHER_BASE = "https://api.willyweather.com.au/v2";

// Open-Meteo Marine API — free, no key, has swell forecasts
// Coords: Long Reef, Northern Beaches
const OPEN_METEO_MARINE_URL =
  "https://marine-api.open-meteo.com/v1/marine?latitude=-33.74&longitude=151.32&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,wind_wave_height,wind_wave_period,wind_wave_direction&forecast_days=3&timezone=Australia%2FSydney";

// BOM wave buoy fallback — Sydney waverider buoy
const BOM_WAVE_BUOY_URL =
  "http://www.bom.gov.au/fwo/IDN60801/IDN60801.94768.json";

// --- Helpers ---

function degreesToCompass(deg: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

/**
 * Determine swell trend from recent readings.
 * Compares the last 3+ readings to detect building/dropping/holding.
 */
function determineTrend(
  readings: { height: number; timestamp: string }[]
): SwellConditions["trend"] {
  if (readings.length < 3) return "holding";

  // Take last 6 readings (or whatever we have)
  const recent = readings.slice(0, Math.min(6, readings.length));
  const oldest = recent[recent.length - 1].height;
  const newest = recent[0].height;
  const diff = newest - oldest;

  // Threshold: 0.2m change = significant
  if (diff > 0.2) return "building";
  if (diff < -0.2) return "dropping";
  return "holding";
}

/**
 * Classify swell type based on period.
 * Long-period groundswell (12+ sec) is more impactful than
 * short-period wind chop (6-7 sec) for the same height.
 */
export function classifySwellType(
  period: number
): "groundswell" | "mid-period" | "wind-chop" {
  if (period >= 12) return "groundswell";
  if (period >= 8) return "mid-period";
  return "wind-chop";
}

/**
 * Calculate effective swell impact — groundswell hits harder.
 * A 1m 14s groundswell has more impact than a 1m 6s wind chop.
 */
export function effectiveSwellImpact(height: number, period: number): number {
  const periodMultiplier = period >= 12 ? 1.5 : period >= 8 ? 1.2 : 1.0;
  return height * periodMultiplier;
}

// --- Fetch functions ---

/**
 * Fetch swell data from Willyweather API.
 * Requires WILLYWEATHER_API_KEY in environment.
 */
async function fetchFromWillyweather(): Promise<SwellConditions | null> {
  const apiKey = process.env.WILLYWEATHER_API_KEY;
  if (!apiKey) {
    console.warn("Willyweather: WILLYWEATHER_API_KEY not set");
    return null;
  }

  try {
    const url = `${WILLYWEATHER_BASE}/${apiKey}/locations/${WILLYWEATHER_LOCATION_ID}/weather.json?forecasts=swell,wind,weather,rainfallprobability&days=3`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`Willyweather: API returned ${res.status} ${res.statusText}: ${body.substring(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as {
      forecasts?: {
        swell?: {
          days?: {
            entries?: {
              dateTime: string;
              height: number;
              period: number;
              direction: number;
              directionText: string;
            }[];
          }[];
        };
        wind?: {
          days?: {
            entries?: {
              dateTime: string;
              speed: number;
              gustSpeed: number;
              direction: number;
              directionText: string;
            }[];
          }[];
        };
        weather?: {
          days?: {
            entries?: {
              dateTime: string;
              precisCode: string; // e.g. "showers", "cloudy", "mostly-sunny"
              precis: string; // e.g. "Showers", "Cloudy", "Mostly Sunny"
            }[];
          }[];
        };
        rainfallprobability?: {
          days?: {
            entries?: {
              dateTime: string;
              probability: number; // 0-100
            }[];
          }[];
        };
      };
    };

    // Parse swell forecast entries
    const swellDays = data.forecasts?.swell?.days ?? [];
    const allSwellEntries = swellDays.flatMap((d) => d.entries ?? []);

    if (allSwellEntries.length === 0) return null;

    // Find the entry closest to now (not just the first one, which may be midnight)
    // Willyweather timestamps are in AEST (Australia/Sydney) — append timezone
    // so they parse correctly on Vercel's UTC servers.
    const toAEST = (dt: string) => new Date(dt.replace(" ", "T") + "+11:00").getTime();
    const nowMs = Date.now();
    let closestSwellIdx = 0;
    let closestSwellDiff = Infinity;
    for (let i = 0; i < allSwellEntries.length; i++) {
      const diff = Math.abs(toAEST(allSwellEntries[i].dateTime) - nowMs);
      if (diff < closestSwellDiff) {
        closestSwellDiff = diff;
        closestSwellIdx = i;
      }
    }

    const currentEntry = allSwellEntries[closestSwellIdx];
    const current: SwellReading = {
      timestamp: currentEntry.dateTime,
      height: currentEntry.height,
      period: currentEntry.period,
      direction: currentEntry.directionText,
      directionDeg: currentEntry.direction,
    };

    const forecast: SwellForecastPoint[] = allSwellEntries.map((e) => ({
      timestamp: e.dateTime,
      height: e.height,
      period: e.period,
      direction: e.directionText,
      directionDeg: e.direction,
    }));

    // Parse wind forecast entries
    const windDays = data.forecasts?.wind?.days ?? [];
    const allWindEntries = windDays.flatMap((d) => d.entries ?? []);

    const windForecast: WindForecastPoint[] = allWindEntries.map((e) => ({
      timestamp: e.dateTime,
      speed: e.speed,
      gust: e.gustSpeed,
      direction: e.directionText,
      directionDeg: e.direction,
    }));

    // Use entries around the current time for trend (a few before + a few after)
    const trendStart = Math.max(0, closestSwellIdx - 3);
    const trendEnd = Math.min(allSwellEntries.length, closestSwellIdx + 4);
    const trendEntries = allSwellEntries.slice(trendStart, trendEnd);
    // Reverse so newest is first (determineTrend expects newest-first)
    trendEntries.reverse();
    const trend = determineTrend(
      trendEntries.map((e) => ({
        height: e.height,
        timestamp: e.dateTime,
      }))
    );

    // Parse weather forecast (precis + rain probability)
    const weatherDays = data.forecasts?.weather?.days ?? [];
    const allWeatherEntries = weatherDays.flatMap((d) => d.entries ?? []);
    const rainDays = data.forecasts?.rainfallprobability?.days ?? [];
    const allRainEntries = rainDays.flatMap((d) => d.entries ?? []);

    const weatherForecast: WeatherForecastPoint[] = allWeatherEntries.map((e) => {
      // Find matching rain probability entry
      const rainEntry = allRainEntries.find((r) => r.dateTime === e.dateTime);
      return {
        timestamp: e.dateTime,
        precis: e.precis,
        rainProbability: rainEntry?.probability,
      };
    });

    return {
      current,
      secondary: null,
      trend,
      forecast,
      windForecast,
      weatherForecast,
      source: "willyweather" as const,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Willyweather: fetch failed", err);
    return null;
  }
}

/**
 * Fetch swell data from Open-Meteo Marine API (free, no key).
 * Provides hourly swell forecasts with height, period, and direction.
 * Separates primary swell from wind waves.
 */
async function fetchFromOpenMeteo(): Promise<SwellConditions | null> {
  try {
    const res = await fetch(OPEN_METEO_MARINE_URL, { cache: "no-store" });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      hourly?: {
        time?: string[];
        wave_height?: (number | null)[];
        wave_period?: (number | null)[];
        wave_direction?: (number | null)[];
        swell_wave_height?: (number | null)[];
        swell_wave_period?: (number | null)[];
        swell_wave_direction?: (number | null)[];
        wind_wave_height?: (number | null)[];
        wind_wave_period?: (number | null)[];
        wind_wave_direction?: (number | null)[];
      };
    };

    const hourly = data.hourly;
    if (!hourly?.time || hourly.time.length === 0) return null;

    // Find the index closest to now
    const nowMs = Date.now();
    let closestIdx = 0;
    let closestDiff = Infinity;
    for (let i = 0; i < hourly.time.length; i++) {
      const diff = Math.abs(new Date(hourly.time[i]).getTime() - nowMs);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = i;
      }
    }

    const swellH = hourly.swell_wave_height?.[closestIdx] ?? hourly.wave_height?.[closestIdx] ?? 0;
    const swellP = hourly.swell_wave_period?.[closestIdx] ?? hourly.wave_period?.[closestIdx] ?? 0;
    const swellD = hourly.swell_wave_direction?.[closestIdx] ?? hourly.wave_direction?.[closestIdx] ?? 0;

    const current: SwellReading = {
      timestamp: hourly.time[closestIdx],
      height: Math.round(swellH * 10) / 10,
      period: Math.round(swellP),
      direction: degreesToCompass(swellD),
      directionDeg: Math.round(swellD),
    };

    // Secondary swell (wind waves) if available and significant
    let secondary: SwellReading | null = null;
    const windWaveH = hourly.wind_wave_height?.[closestIdx];
    if (windWaveH && windWaveH >= 0.3) {
      const windWaveP = hourly.wind_wave_period?.[closestIdx] ?? 0;
      const windWaveD = hourly.wind_wave_direction?.[closestIdx] ?? 0;
      secondary = {
        timestamp: hourly.time[closestIdx],
        height: Math.round(windWaveH * 10) / 10,
        period: Math.round(windWaveP),
        direction: degreesToCompass(windWaveD),
        directionDeg: Math.round(windWaveD),
      };
    }

    // Build forecast from hourly data (every 3 hours to match Willyweather density)
    const forecast: SwellForecastPoint[] = [];
    for (let i = closestIdx; i < hourly.time.length; i += 3) {
      const h = hourly.swell_wave_height?.[i] ?? hourly.wave_height?.[i] ?? 0;
      const p = hourly.swell_wave_period?.[i] ?? hourly.wave_period?.[i] ?? 0;
      const d = hourly.swell_wave_direction?.[i] ?? hourly.wave_direction?.[i] ?? 0;
      forecast.push({
        timestamp: hourly.time[i],
        height: Math.round(h * 10) / 10,
        period: Math.round(p),
        direction: degreesToCompass(d),
        directionDeg: Math.round(d),
      });
    }

    // Trend from the next 6 hours of data
    const trendReadings = [];
    for (let i = closestIdx; i < Math.min(closestIdx + 7, hourly.time.length); i++) {
      const h = hourly.swell_wave_height?.[i] ?? hourly.wave_height?.[i] ?? 0;
      trendReadings.push({ height: h, timestamp: hourly.time[i] });
    }
    // Reverse so newest is first (determineTrend expects newest-first)
    trendReadings.reverse();
    const trend = determineTrend(trendReadings);

    return {
      current,
      secondary,
      trend,
      forecast,
      windForecast: [], // Open-Meteo marine doesn't include wind speed in knots
      weatherForecast: [],
      source: "open-meteo" as const,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch swell data from BOM wave buoy as fallback.
 * Sydney waverider buoy provides significant wave height and period.
 */
async function fetchFromBomBuoy(): Promise<SwellConditions | null> {
  try {
    const res = await fetch(BOM_WAVE_BUOY_URL, {
      cache: "no-store",
      headers: {
        "User-Agent": "SpearfishingIntel/1.0 (personal project)",
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      observations?: {
        data?: {
          local_date_time_full: string;
          hsig: number; // significant wave height
          tp1: number; // peak period
          peak_dir: number;
          hmax: number; // max wave height
          tsig: number; // significant period
        }[];
      };
    };

    const obs = data.observations?.data;
    if (!obs || obs.length === 0) return null;

    const latest = obs[0];
    const current: SwellReading = {
      timestamp: latest.local_date_time_full,
      height: latest.hsig ?? 0,
      period: latest.tp1 ?? latest.tsig ?? 0,
      direction: degreesToCompass(latest.peak_dir ?? 0),
      directionDeg: latest.peak_dir ?? 0,
    };

    const trend = determineTrend(
      obs.slice(0, 12).map((o) => ({
        height: o.hsig ?? 0,
        timestamp: o.local_date_time_full,
      }))
    );

    // BOM buoy doesn't give forecast, only observations
    return {
      current,
      secondary: null,
      trend,
      forecast: [], // no forecast from buoy data
      windForecast: [],
      weatherForecast: [],
      source: "bom-buoy" as const,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// --- Main fetch function ---

/**
 * Fetch swell conditions from best available source.
 * Fallback chain: Willyweather -> Open-Meteo -> BOM buoy.
 * Returns null when all sources are unavailable — never fabricates data.
 * Cached for 1 hour.
 */
export async function fetchSwellData(): Promise<SwellConditions | null> {
  return cachedFetch("swell-conditions", TTL.ONE_HOUR, async () => {
    // 1. Willyweather (paid, best Australian data)
    const ww = await fetchFromWillyweather();
    if (ww) return ww;

    // 2. Open-Meteo Marine (free, has forecasts)
    const om = await fetchFromOpenMeteo();
    if (om) return om;

    // 3. BOM wave buoy (free, observations only)
    const buoy = await fetchFromBomBuoy();
    if (buoy) return buoy;

    // All sources failed — return null, never fabricate data
    console.warn("All swell APIs unreachable — no swell data available");
    return null;
  });
}

/**
 * Swell and surf forecast data fetching.
 *
 * Primary source: Willyweather API (Australian-focused, good coastal coverage).
 * Fallback: BOM wave buoy data (Sydney waverider buoy).
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

export interface SwellConditions {
  current: SwellReading;
  secondary: SwellReading | null;
  trend: "building" | "holding" | "dropping";
  forecast: SwellForecastPoint[];
  windForecast: WindForecastPoint[];
  fetchedAt: string;
}

// --- Willyweather config ---

// Long Reef location ID on Willyweather (Northern Beaches reference)
const WILLYWEATHER_LOCATION_ID = "4950"; // Long Reef, NSW
const WILLYWEATHER_BASE = "https://api.willyweather.com.au/v2";

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
  if (!apiKey) return null;

  try {
    const url = `${WILLYWEATHER_BASE}/${apiKey}/locations/${WILLYWEATHER_LOCATION_ID}/weather.json?forecasts=swell,wind&days=3`;
    const res = await fetch(url);

    if (!res.ok) return null;

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
      };
    };

    // Parse swell forecast entries
    const swellDays = data.forecasts?.swell?.days ?? [];
    const allSwellEntries = swellDays.flatMap((d) => d.entries ?? []);

    if (allSwellEntries.length === 0) return null;

    const current: SwellReading = {
      timestamp: allSwellEntries[0].dateTime,
      height: allSwellEntries[0].height,
      period: allSwellEntries[0].period,
      direction: allSwellEntries[0].directionText,
      directionDeg: allSwellEntries[0].direction,
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

    const trend = determineTrend(
      allSwellEntries.map((e) => ({
        height: e.height,
        timestamp: e.dateTime,
      }))
    );

    return {
      current,
      secondary: null,
      trend,
      forecast,
      windForecast,
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
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// --- Main fetch function ---

/**
 * Fetch swell conditions from best available source.
 * Tries Willyweather first (has forecast), falls back to BOM buoy (obs only).
 * Cached for 1 hour.
 */
export async function fetchSwellData(): Promise<SwellConditions> {
  return cachedFetch("swell-conditions", TTL.ONE_HOUR, async () => {
    // Try Willyweather first (includes forecast)
    const ww = await fetchFromWillyweather();
    if (ww) return ww;

    // Fallback to BOM buoy
    const buoy = await fetchFromBomBuoy();
    if (buoy) return buoy;

    // If all sources fail, return empty conditions
    return {
      current: {
        timestamp: new Date().toISOString(),
        height: 0,
        period: 0,
        direction: "N/A",
        directionDeg: 0,
      },
      secondary: null,
      trend: "holding",
      forecast: [],
      windForecast: [],
      fetchedAt: new Date().toISOString(),
    };
  });
}

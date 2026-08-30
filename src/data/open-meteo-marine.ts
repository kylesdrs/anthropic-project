/**
 * Open-Meteo Marine API for current marine conditions.
 *
 * Fetches real-time sea surface temperature, ocean current velocity/direction,
 * and primary/secondary swell data from the keyless Marine API.
 *
 * Endpoint: https://marine-api.open-meteo.com/v1/marine
 * No API key required.
 */

import { cachedFetch, TTL } from "./cache";

// --- Types ---

export interface MarineCurrentData {
  velocity: number; // m/s
  direction: number; // degrees (0-360)
  directionCompass: string; // e.g. "NE", "SE"
}

export interface PrimarySwell {
  height: number; // metres
  period: number; // seconds
  direction: number; // degrees
  directionCompass: string;
}

export interface SecondarySwell {
  height: number; // metres
  period: number; // seconds
  direction: number; // degrees
  directionCompass: string;
}

export interface MarineConditions {
  timestamp: string; // ISO timestamp of observation
  seaSurfaceTemp: number; // °C
  oceanCurrent: MarineCurrentData;
  primarySwell: PrimarySwell;
  secondarySwell: SecondarySwell | null;
  windWave: {
    height: number;
    period: number;
  };
}

// --- Config ---

const LATITUDE = -33.75;
const LONGITUDE = 151.30;

// --- Helpers ---

function degreesToCompass(deg: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

// --- Fetch ---

/**
 * Fetch current marine conditions from Open-Meteo.
 * Returns the latest hourly observation with real SST, current, and swell data.
 * Cached for 30 minutes.
 */
export async function fetchMarineConditions(): Promise<MarineConditions | null> {
  return cachedFetch("open-meteo-marine", TTL.THIRTY_MINUTES, async () => {
    try {
      const url =
        `https://marine-api.open-meteo.com/v1/marine?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
        `&hourly=sea_surface_temperature,ocean_current_velocity,ocean_current_direction,` +
        `swell_wave_height,swell_wave_period,swell_wave_direction,` +
        `wind_wave_height,wind_wave_period` +
        `&timezone=Australia%2FSydney`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        console.error(`Marine API error: ${res.status}`);
        return null;
      }

      const json = (await res.json()) as {
        hourly?: {
          time?: string[];
          sea_surface_temperature?: (number | null)[];
          ocean_current_velocity?: (number | null)[];
          ocean_current_direction?: (number | null)[];
          swell_wave_height?: (number | null)[];
          swell_wave_period?: (number | null)[];
          swell_wave_direction?: (number | null)[];
          wind_wave_height?: (number | null)[];
          wind_wave_period?: (number | null)[];
        };
      };

      const hourly = json.hourly;
      if (!hourly || !hourly.time || hourly.time.length === 0) {
        return null;
      }

      // Get the most recent hour (index 0)
      const latestIndex = 0;
      const timestamp = hourly.time[latestIndex];

      // Extract values, defaulting safely
      const sst = hourly.sea_surface_temperature?.[latestIndex] ?? 21;
      const currentVel = Math.max(0, hourly.ocean_current_velocity?.[latestIndex] ?? 0);
      const currentDir = hourly.ocean_current_direction?.[latestIndex] ?? 0;

      // Primary and secondary swell (Open-Meteo returns combined values)
      // We'll treat the main swell as primary and secondary as null/fallback
      const swellH = hourly.swell_wave_height?.[latestIndex] ?? 0;
      const swellP = hourly.swell_wave_period?.[latestIndex] ?? 0;
      const swellD = hourly.swell_wave_direction?.[latestIndex] ?? 0;

      const windH = hourly.wind_wave_height?.[latestIndex] ?? 0;
      const windP = hourly.wind_wave_period?.[latestIndex] ?? 0;

      return {
        timestamp: new Date(timestamp).toISOString(),
        seaSurfaceTemp: Math.round(sst * 10) / 10,
        oceanCurrent: {
          velocity: Math.round(currentVel * 100) / 100,
          direction: Math.round(currentDir),
          directionCompass: degreesToCompass(currentDir),
        },
        primarySwell: {
          height: Math.round(swellH * 10) / 10,
          period: Math.round(swellP),
          direction: Math.round(swellD),
          directionCompass: degreesToCompass(swellD),
        },
        secondarySwell: null, // Open-Meteo doesn't separate secondary swell
        windWave: {
          height: Math.round(windH * 10) / 10,
          period: Math.round(windP),
        },
      };
    } catch (err) {
      console.error("Marine conditions fetch failed:", err);
      return null;
    }
  });
}

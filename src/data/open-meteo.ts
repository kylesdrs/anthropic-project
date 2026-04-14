/**
 * Open-Meteo 5-day marine + weather forecast fetcher.
 *
 * Provides swell, wind, rain, cloud, and temperature forecasts for
 * 5 days out. Free API, no key required.
 *
 * Used as:
 * - Primary source for days 4-5 (Willyweather only covers 3 days)
 * - Fallback for days 1-3 when Willyweather is unavailable
 * - Wind/rain supplement when Willyweather doesn't provide it
 */

import { cachedFetch, TTL } from "./cache";

// --- Types ---

export interface OpenMeteoDay {
  date: string; // YYYY-MM-DD
  /** Morning swell (6am-10am average) */
  swell: {
    height: number;
    period: number;
    direction: string;
    directionDeg: number;
  };
  /** Morning wind (6am-10am average) */
  wind: {
    speed: number; // knots
    gust: number; // knots
    direction: string;
    directionDeg: number;
  };
  /** Daily aggregates */
  rainProbability: number; // 0-100
  cloudCover: number; // 0-100 (percentage)
  precis: string; // Derived from cloud/rain
  waterTemp: number | null;
}

// --- Config ---

const LATITUDE = -33.74;
const LONGITUDE = 151.32;

// Open-Meteo Marine API for swell data (5 days)
const MARINE_URL =
  `https://marine-api.open-meteo.com/v1/marine?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
  `&hourly=swell_wave_height,swell_wave_period,swell_wave_direction,wave_height,wave_period,wave_direction` +
  `&forecast_days=6&timezone=Australia%2FSydney`;

// Open-Meteo Weather API for wind, rain, cloud, temp
const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
  `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,precipitation_probability` +
  `&daily=precipitation_probability_max,weather_code` +
  `&forecast_days=6&timezone=Australia%2FSydney&wind_speed_unit=kn`;

// --- Helpers ---

function degreesToCompass(deg: number): string {
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

/** Average values in an array, skipping nulls. */
function avg(values: (number | null | undefined)[]): number {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

/** Derive a simple precis string from cloud cover and rain probability. */
function derivePrecis(cloud: number, rain: number): string {
  if (rain >= 70) return "Showers";
  if (rain >= 40) return "Possible showers";
  if (cloud >= 80) return "Overcast";
  if (cloud >= 50) return "Cloudy";
  if (cloud >= 25) return "Partly cloudy";
  return "Mostly sunny";
}

// --- Fetch ---

/**
 * Fetch 5-day forecast from Open-Meteo (marine + weather).
 * Returns one entry per day with morning (6am-10am) averages.
 * Cached for 3 hours.
 */
export async function fetchOpenMeteo5Day(): Promise<OpenMeteoDay[] | null> {
  return cachedFetch("open-meteo-5day", TTL.THREE_HOURS, async () => {
    try {
      const [marineRes, weatherRes] = await Promise.all([
        fetch(MARINE_URL, { cache: "no-store" }),
        fetch(WEATHER_URL, { cache: "no-store" }),
      ]);

      if (!marineRes.ok && !weatherRes.ok) return null;

      const marine = marineRes.ok
        ? ((await marineRes.json()) as {
            hourly?: {
              time?: string[];
              swell_wave_height?: (number | null)[];
              swell_wave_period?: (number | null)[];
              swell_wave_direction?: (number | null)[];
              wave_height?: (number | null)[];
              wave_period?: (number | null)[];
              wave_direction?: (number | null)[];
            };
          })
        : null;

      const weather = weatherRes.ok
        ? ((await weatherRes.json()) as {
            hourly?: {
              time?: string[];
              wind_speed_10m?: (number | null)[];
              wind_gusts_10m?: (number | null)[];
              wind_direction_10m?: (number | null)[];
              cloud_cover?: (number | null)[];
              precipitation_probability?: (number | null)[];
            };
            daily?: {
              time?: string[];
              precipitation_probability_max?: (number | null)[];
              weather_code?: (number | null)[];
            };
          })
        : null;

      // Build date -> hourly index map for marine data
      const marineHourly = marine?.hourly;
      const weatherHourly = weather?.hourly;

      // Group hourly data by date
      const days = new Map<string, {
        marineIndices: number[];
        weatherIndices: number[];
      }>();

      // Index marine hours
      if (marineHourly?.time) {
        for (let i = 0; i < marineHourly.time.length; i++) {
          const date = marineHourly.time[i].substring(0, 10);
          const hour = parseInt(marineHourly.time[i].substring(11, 13));
          if (hour >= 6 && hour <= 10) {
            if (!days.has(date)) days.set(date, { marineIndices: [], weatherIndices: [] });
            days.get(date)!.marineIndices.push(i);
          }
        }
      }

      // Index weather hours
      if (weatherHourly?.time) {
        for (let i = 0; i < weatherHourly.time.length; i++) {
          const date = weatherHourly.time[i].substring(0, 10);
          const hour = parseInt(weatherHourly.time[i].substring(11, 13));
          if (hour >= 6 && hour <= 10) {
            if (!days.has(date)) days.set(date, { marineIndices: [], weatherIndices: [] });
            days.get(date)!.weatherIndices.push(i);
          }
        }
      }

      // Build daily summaries from morning windows
      const result: OpenMeteoDay[] = [];

      // Sort dates and take first 5 starting from today
      const sortedDates = Array.from(days.keys()).sort();
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
      const relevantDates = sortedDates.filter(d => d >= todayStr).slice(0, 5);

      for (const date of relevantDates) {
        const { marineIndices, weatherIndices } = days.get(date)!;

        // Swell averages from marine data
        const swellH = avg(marineIndices.map(i =>
          marineHourly?.swell_wave_height?.[i] ?? marineHourly?.wave_height?.[i] ?? null
        ));
        const swellP = avg(marineIndices.map(i =>
          marineHourly?.swell_wave_period?.[i] ?? marineHourly?.wave_period?.[i] ?? null
        ));
        const swellDVals = marineIndices
          .map(i => marineHourly?.swell_wave_direction?.[i] ?? marineHourly?.wave_direction?.[i] ?? null)
          .filter((v): v is number => v != null);
        const swellD = swellDVals.length > 0
          ? Math.round(swellDVals.reduce((a, b) => a + b, 0) / swellDVals.length)
          : 0;

        // Wind averages from weather data
        const windS = avg(weatherIndices.map(i => weatherHourly?.wind_speed_10m?.[i] ?? null));
        const windG = avg(weatherIndices.map(i => weatherHourly?.wind_gusts_10m?.[i] ?? null));
        const windDVals = weatherIndices
          .map(i => weatherHourly?.wind_direction_10m?.[i] ?? null)
          .filter((v): v is number => v != null);
        const windD = windDVals.length > 0
          ? Math.round(windDVals.reduce((a, b) => a + b, 0) / windDVals.length)
          : 0;

        // Cloud and rain
        const cloud = avg(weatherIndices.map(i => weatherHourly?.cloud_cover?.[i] ?? null));

        // Use daily max rain probability if available, otherwise morning average
        const dailyIdx = weather?.daily?.time?.indexOf(date) ?? -1;
        const dailyRain = dailyIdx >= 0 ? weather?.daily?.precipitation_probability_max?.[dailyIdx] : null;
        const rain = dailyRain ??
          avg(weatherIndices.map(i => weatherHourly?.precipitation_probability?.[i] ?? null));

        result.push({
          date,
          swell: {
            height: swellH,
            period: Math.round(swellP),
            direction: degreesToCompass(swellD),
            directionDeg: swellD,
          },
          wind: {
            speed: Math.round(windS),
            gust: Math.round(windG),
            direction: degreesToCompass(windD),
            directionDeg: windD,
          },
          rainProbability: Math.round(rain),
          cloudCover: Math.round(cloud),
          precis: derivePrecis(cloud, rain),
          waterTemp: null, // Open-Meteo doesn't provide SST in free tier
        });
      }

      return result.length > 0 ? result : null;
    } catch (err) {
      console.error("Open-Meteo 5-day fetch failed:", err);
      return null;
    }
  });
}

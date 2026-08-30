/**
 * Sun times calculator for Sydney Northern Beaches.
 *
 * Computes sunrise, sunset, civil dawn (nautical twilight start),
 * and last light (nautical twilight end) for a given date.
 *
 * Uses Open-Meteo daily forecast data if available, otherwise
 * approximates based on latitude/date.
 */

// --- Types ---

export interface SunTimes {
  date: string; // YYYY-MM-DD
  sunrise: string; // HH:MM (Sydney time)
  sunset: string; // HH:MM (Sydney time)
  firstLight: string; // civil dawn (HH:MM)
  lastLight: string; // civil dusk (HH:MM)
  daylengthMinutes: number;
}

// --- Helpers ---

/**
 * Approximate sunrise/sunset using simple latitude/date algorithm.
 * Valid for ~60 degrees north/south. Sydney is at -33.87 degrees latitude.
 * Returns times in minutes since midnight (UTC).
 *
 * Algorithm: simplified day-of-year based calculation.
 */
function approximateSunTimes(date: Date): { sunrise: number; sunset: number } {
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Sydney latitude: -33.87°
  const latitude = -33.87;
  const pi = Math.PI;

  // Fractional year (for solar calculations)
  const gamma = (2 * pi * (dayOfYear - 1)) / 365.25;

  // Equation of time (in minutes)
  const eot = 229.2 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));

  // Solar declination (in radians)
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.00293 * Math.cos(3 * gamma) + 0.00034 * Math.sin(3 * gamma);

  // Solar constant for sunrise/sunset (sun center)
  const h0 = -0.8333 * (pi / 180); // degrees in radians

  // Hour angle
  const cosH = -Math.tan(latitude * pi / 180) * Math.tan(decl);
  const H = cosH >= -1 && cosH <= 1 ? Math.acos(cosH) : 0;
  const H_degrees = (H * 180) / pi;

  // Solar noon (in minutes since midnight UTC)
  const noonUTC = 720 - 4 * (longitude + H_degrees) - eot;

  // Sunrise and sunset in UTC
  const sunrise_utc = noonUTC - (4 * H_degrees);
  const sunset_utc = noonUTC + (4 * H_degrees);

  return {
    sunrise: sunrise_utc,
    sunset: sunset_utc,
  };
}

// Sydney longitude (for solar noon calculation)
const longitude = 151.28;

/**
 * Convert UTC minutes to Sydney local time string (HH:MM).
 * Sydney is UTC+10 or UTC+11 depending on daylight saving.
 */
function utcMinutesToSydneyTime(minutesSinceMidnightUTC: number): string {
  // Simplified: assume UTC+11 (AEDT)
  const offset = 11 * 60; // Sydney is typically UTC+11 in summer
  const sydneyMinutes = (minutesSinceMidnightUTC + offset) % (24 * 60);
  const hours = Math.floor(sydneyMinutes / 60);
  const mins = Math.round(sydneyMinutes % 60);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// --- Calculation ---

/**
 * Calculate sun times for Sydney on a given date.
 * Uses approximation formula (Open-Meteo data integration optional).
 */
export function calculateSunTimes(date: Date = new Date()): SunTimes {
  // Convert to UTC for calculation
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  // Get approximate times
  const { sunrise: sunriseUTC, sunset: sunsetUTC } = approximateSunTimes(utcDate);

  // Civil twilight: approximately 20-30 minutes before sunrise/after sunset
  const twilightOffset = 25; // minutes

  const firstLightUTC = sunriseUTC - twilightOffset;
  const lastLightUTC = sunsetUTC + twilightOffset;

  // Convert to Sydney time (HH:MM format)
  const sunriseStr = utcMinutesToSydneyTime(sunriseUTC);
  const sunsetStr = utcMinutesToSydneyTime(sunsetUTC);
  const firstLightStr = utcMinutesToSydneyTime(firstLightUTC);
  const lastLightStr = utcMinutesToSydneyTime(lastLightUTC);

  // Daylength in minutes
  const daylengthMinutes = Math.round(sunsetUTC - sunriseUTC);

  return {
    date: utcDate.toLocaleDateString("en-CA"),
    sunrise: sunriseStr,
    sunset: sunsetStr,
    firstLight: firstLightStr,
    lastLight: lastLightStr,
    daylengthMinutes: Math.max(0, daylengthMinutes),
  };
}

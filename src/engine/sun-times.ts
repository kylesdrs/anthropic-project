/**
 * Sun times calculator for Sydney Northern Beaches.
 *
 * Computes sunrise, sunset, civil dawn (first light) and civil dusk
 * (last light) for a given date, returned in Sydney local time.
 * Uses the NOAA sunrise/sunset approximation.
 */

// --- Types ---

export interface SunTimes {
  date: string; // YYYY-MM-DD
  sunrise: string; // HH:MM (Sydney time)
  sunset: string; // HH:MM (Sydney time)
  firstLight: string; // civil dawn (HH:MM, Sydney time)
  lastLight: string; // civil dusk (HH:MM, Sydney time)
  daylengthMinutes: number;
}

const LATITUDE = -33.87; // Sydney Northern Beaches
const LONGITUDE = 151.28; // east positive

/**
 * Sunrise/sunset as minutes since midnight UTC (NOAA approximation).
 */
function approximateSunTimes(date: Date): { sunrise: number; sunset: number } {
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear =
    Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const pi = Math.PI;
  const gamma = (2 * pi * (dayOfYear - 1)) / 365.25;

  // Equation of time (minutes)
  const eot =
    229.2 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.00293 * Math.cos(3 * gamma) +
    0.00034 * Math.sin(3 * gamma);

  // Hour angle for sunrise/sunset (sun centre, no refraction term for simplicity)
  const cosH = -Math.tan((LATITUDE * pi) / 180) * Math.tan(decl);
  const H = cosH >= -1 && cosH <= 1 ? Math.acos(cosH) : 0;
  const hDeg = (H * 180) / pi;

  // Solar noon in UTC minutes (longitude east positive)
  const noonUTC = 720 - 4 * LONGITUDE - eot;

  return {
    sunrise: noonUTC - 4 * hDeg,
    sunset: noonUTC + 4 * hDeg,
  };
}

/**
 * Sydney UTC offset in minutes for the given date, DST-aware.
 * Works regardless of the server's own timezone.
 */
function sydneyOffsetMinutes(d: Date): number {
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const syd = new Date(d.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  return Math.round((syd.getTime() - utc.getTime()) / 60000);
}

/** UTC minutes-since-midnight to a Sydney HH:MM clock string. */
function toSydneyClock(minutesUTC: number, offsetMinutes: number): string {
  let m = Math.round(minutesUTC + offsetMinutes);
  m = ((m % 1440) + 1440) % 1440; // normalise into [0, 1440)
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// --- Calculation ---

export function calculateSunTimes(date: Date = new Date()): SunTimes {
  // Anchor the calculation at midday UTC of the target date to avoid
  // day-boundary drift.
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)
  );

  const { sunrise: sunriseUTC, sunset: sunsetUTC } = approximateSunTimes(utcDate);

  // Civil twilight: roughly 30 minutes before sunrise / after sunset.
  const twilightOffset = 30;
  const offset = sydneyOffsetMinutes(date);

  const daylengthMinutes = Math.max(0, Math.round(sunsetUTC - sunriseUTC));

  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(date),
    sunrise: toSydneyClock(sunriseUTC, offset),
    sunset: toSydneyClock(sunsetUTC, offset),
    firstLight: toSydneyClock(sunriseUTC - twilightOffset, offset),
    lastLight: toSydneyClock(sunsetUTC + twilightOffset, offset),
    daylengthMinutes,
  };
}

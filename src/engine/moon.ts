/**
 * Moon phase and solunar activity calculator.
 *
 * Computes moon phase (illumination %, phase name) from date.
 * Generates approximate solunar major/minor feeding windows based on
 * moon transit and rise/set times (simple heuristic).
 *
 * Uses synodic month (~29.53 days) from a known new moon epoch.
 */

// --- Constants ---

/** New moon reference: 2000-01-06 (JD 2451550.5) */
const NEW_MOON_EPOCH_JD = 2451550.5;
const SYNODIC_MONTH = 29.530588; // days

// --- Types ---

export interface MoonPhase {
  illumination: number; // 0-100 (%)
  phaseName: string; // "new", "waxing", "first-quarter", "waxing-gibbous", "full", "waning-gibbous", "last-quarter", "waning-crescent"
  daysInCycle: number; // 0-29.53
  nextFullMoon: string; // ISO date
  nextNewMoon: string; // ISO date
}

export interface SolunarWindow {
  startHour: number; // 0-23 (Sydney time)
  endHour: number; // 0-23
  name: string; // "major", "minor"
  intensity: "high" | "medium" | "low";
}

export interface SolunarActivity {
  moonPhase: MoonPhase;
  todayMajorWindows: SolunarWindow[];
  todayMinorWindows: SolunarWindow[];
  bestWindow: SolunarWindow | null;
  fishActivityForecast: string;
}

// --- Helpers ---

/** Julian Day Number from a Date */
function dateToJD(d: Date): number {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hours = d.getUTCHours() / 24;

  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;

  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  return jdn - 0.5 + hours;
}

/** Date from Julian Day Number */
function jdToDate(jd: number): Date {
  const a = Math.floor(jd + 0.5) + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);

  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor((m + 10) / 12);
  const year = 100 * b + d - 4800 + Math.floor((m + 10) / 12);

  const frac = jd + 0.5 - Math.floor(jd + 0.5);
  const hours = frac * 24;
  const mins = (hours % 1) * 60;
  const secs = (mins % 1) * 60;

  return new Date(Date.UTC(year, month - 1, day, Math.floor(hours), Math.floor(mins), Math.floor(secs)));
}

// --- Moon Phase Calculation ---

/**
 * Calculate moon phase from a given date.
 */
export function calculateMoonPhase(date: Date = new Date()): MoonPhase {
  const jd = dateToJD(date);
  const daysSinceNewMoon = (jd - NEW_MOON_EPOCH_JD) % SYNODIC_MONTH;
  const daysInCycle = daysSinceNewMoon < 0 ? daysSinceNewMoon + SYNODIC_MONTH : daysSinceNewMoon;

  // Illumination as percentage
  const illumination = Math.round((1 - Math.cos((2 * Math.PI * daysInCycle) / SYNODIC_MONTH)) / 2 * 100);

  // Phase name
  let phaseName: MoonPhase["phaseName"];
  if (daysInCycle < 1.84) phaseName = "new";
  else if (daysInCycle < 7.38) phaseName = "waxing";
  else if (daysInCycle < 9.23) phaseName = "first-quarter";
  else if (daysInCycle < 14.77) phaseName = "waxing-gibbous";
  else if (daysInCycle < 16.61) phaseName = "full";
  else if (daysInCycle < 22.15) phaseName = "waning-gibbous";
  else if (daysInCycle < 23.99) phaseName = "last-quarter";
  else phaseName = "waning-crescent";

  // Next full moon (roughly half cycle away)
  const fullMoonJD = NEW_MOON_EPOCH_JD + Math.ceil((jd - NEW_MOON_EPOCH_JD) / SYNODIC_MONTH) * SYNODIC_MONTH + (SYNODIC_MONTH / 2);
  const nextFullDate = jdToDate(fullMoonJD);

  // Next new moon
  const nextNewJD = NEW_MOON_EPOCH_JD + (Math.ceil((jd - NEW_MOON_EPOCH_JD) / SYNODIC_MONTH) + 1) * SYNODIC_MONTH;
  const nextNewDate = jdToDate(nextNewJD);

  return {
    illumination: Math.max(0, Math.min(100, illumination)),
    phaseName,
    daysInCycle,
    nextFullMoon: nextFullDate.toLocaleDateString("en-CA"),
    nextNewMoon: nextNewDate.toLocaleDateString("en-CA"),
  };
}

// --- Solunar Windows ---

/**
 * Generate approximate solunar major and minor feeding windows for a day.
 * Major windows occur near moon transit and opposite (higher activity).
 * Minor windows occur near moon rise/set (moderate activity).
 *
 * Simplified heuristic: roughly 24h / 24.84h (lunar day) cycle.
 * This gives 2 major windows and 2 minor windows per day, offset by phase.
 */
export function calculateSolunarWindows(date: Date = new Date()): SolunarWindow[] {
  const phase = calculateMoonPhase(date);
  const { daysInCycle } = phase;

  // Lunar day is ~24h 50m = 24.833h
  const lunarDayHours = 24.833;

  // Offset major windows based on moon phase
  // New/Full moon: stronger at midnight/noon (rough approximation)
  // Other phases: vary the offset
  const phaseOffset = (daysInCycle / SYNODIC_MONTH) * 24;

  // Major windows: ~2 per lunar day, roughly 12h apart
  const majorWindow1Start = Math.round((phaseOffset + 6) % 24);
  const majorWindow2Start = Math.round((phaseOffset + 18) % 24);

  // Minor windows: between majors
  const minorWindow1Start = Math.round((phaseOffset + 0) % 24);
  const minorWindow2Start = Math.round((phaseOffset + 12) % 24);

  const windows: SolunarWindow[] = [
    {
      startHour: majorWindow1Start,
      endHour: (majorWindow1Start + 1) % 24,
      name: "major",
      intensity: "high",
    },
    {
      startHour: majorWindow2Start,
      endHour: (majorWindow2Start + 1) % 24,
      name: "major",
      intensity: "high",
    },
    {
      startHour: minorWindow1Start,
      endHour: (minorWindow1Start + 1) % 24,
      name: "minor",
      intensity: "medium",
    },
    {
      startHour: minorWindow2Start,
      endHour: (minorWindow2Start + 1) % 24,
      name: "minor",
      intensity: "medium",
    },
  ];

  return windows;
}

// --- Solunar Activity Summary ---

/**
 * Generate a complete solunar activity summary for a day.
 */
export function getSolunarActivity(date: Date = new Date()): SolunarActivity {
  const moonPhase = calculateMoonPhase(date);
  const windows = calculateSolunarWindows(date);

  const majorWindows = windows.filter((w) => w.name === "major");
  const minorWindows = windows.filter((w) => w.name === "minor");

  // Find the next upcoming window (simple heuristic: filter for windows that haven't passed)
  const currentHour = date.getHours();
  const upcomingMajor = majorWindows.find((w) => w.startHour >= currentHour);
  const upcomingMinor = minorWindows.find((w) => w.startHour >= currentHour);

  const nextMajor = upcomingMajor || majorWindows[0];
  const nextMinor = upcomingMinor || minorWindows[0];

  // Best window is typically the nearest major window
  const bestWindow: SolunarWindow | null = nextMajor
    ? { ...nextMajor }
    : nextMinor
      ? { ...nextMinor }
      : null;

  // Generate a fish activity forecast based on moon phase
  let fishActivityForecast = "";
  if (moonPhase.phaseName === "full" || moonPhase.phaseName === "new") {
    fishActivityForecast = "Highest activity expected. Spring tides amplify current and feeding.";
  } else if (moonPhase.phaseName === "first-quarter" || moonPhase.phaseName === "last-quarter") {
    fishActivityForecast = "Moderate activity. Neap tides reduce current strength.";
  } else if (moonPhase.phaseName === "waxing") {
    fishActivityForecast = "Building activity toward full moon. Kings increasingly active.";
  } else if (moonPhase.phaseName === "waning") {
    fishActivityForecast = "Declining activity after full moon. Still good around dawn/dusk.";
  } else {
    fishActivityForecast = "Check solunar windows for best feeding times.";
  }

  return {
    moonPhase,
    todayMajorWindows: majorWindows,
    todayMinorWindows: minorWindows,
    bestWindow,
    fishActivityForecast,
  };
}

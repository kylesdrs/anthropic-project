/**
 * Moon phase and solunar activity calculator.
 *
 * Moon phase uses the synodic month (~29.53 days) from a known new-moon epoch.
 *
 * Solunar feeding windows are computed from the moon's ACTUAL position for the
 * Sydney Northern Beaches: the major windows are the ~2 hours around the moon's
 * transit (directly overhead) and its opposite passage (underfoot); the minor
 * windows are the ~1 hour around moonrise and moonset. The moon's right
 * ascension and declination come from a low-precision lunar ephemeris
 * (Schlyter's method with the main perturbation terms), which is accurate to a
 * few minutes for this purpose.
 */

// --- Constants ---

const NEW_MOON_EPOCH_JD = 2451550.5; // 2000-01-06
const SYNODIC_MONTH = 29.530588; // days

const LAT_OBS = -33.87; // Sydney Northern Beaches
const LON_OBS = 151.28; // east positive
const MOON_H0 = 0.125; // apparent altitude of moon centre at rise/set (deg)

// --- Types ---

export interface MoonPhase {
  illumination: number; // 0-100 (%)
  phaseName: string;
  daysInCycle: number; // 0-29.53
  nextFullMoon: string; // ISO date
  nextNewMoon: string; // ISO date
}

export interface SolunarWindow {
  start: string; // HH:MM Sydney
  end: string; // HH:MM Sydney
  centerHour: number; // 0-23 Sydney (for ordering)
  name: "major" | "minor";
  intensity: "high" | "medium" | "low";
}

export interface SolunarActivity {
  moonPhase: MoonPhase;
  todayMajorWindows: SolunarWindow[];
  todayMinorWindows: SolunarWindow[];
  bestWindow: SolunarWindow | null;
  moonrise: string | null;
  moonset: string | null;
  transit: string | null;
  fishActivityForecast: string;
  explanation: string;
}

// --- Trig helpers (degrees) ---

const D2R = Math.PI / 180;
const sind = (x: number) => Math.sin(x * D2R);
const cosd = (x: number) => Math.cos(x * D2R);
const asind = (x: number) => Math.asin(x) / D2R;
const atan2d = (y: number, x: number) => Math.atan2(y, x) / D2R;
const rev = (x: number) => ((x % 360) + 360) % 360;

// --- Julian day ---

function dateToJD(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

// --- Moon phase (unchanged, this part is astronomically sound) ---

export function calculateMoonPhase(date: Date = new Date()): MoonPhase {
  const jd = dateToJD(date);
  const daysSinceNewMoon = (jd - NEW_MOON_EPOCH_JD) % SYNODIC_MONTH;
  const daysInCycle = daysSinceNewMoon < 0 ? daysSinceNewMoon + SYNODIC_MONTH : daysSinceNewMoon;

  const illumination = Math.round(((1 - Math.cos((2 * Math.PI * daysInCycle) / SYNODIC_MONTH)) / 2) * 100);

  let phaseName: string;
  if (daysInCycle < 1.84) phaseName = "new";
  else if (daysInCycle < 7.38) phaseName = "waxing-crescent";
  else if (daysInCycle < 9.23) phaseName = "first-quarter";
  else if (daysInCycle < 14.77) phaseName = "waxing-gibbous";
  else if (daysInCycle < 16.61) phaseName = "full";
  else if (daysInCycle < 22.15) phaseName = "waning-gibbous";
  else if (daysInCycle < 23.99) phaseName = "last-quarter";
  else phaseName = "waning-crescent";

  const cyclesSinceEpoch = (jd - NEW_MOON_EPOCH_JD) / SYNODIC_MONTH;
  const fullMoonJD = NEW_MOON_EPOCH_JD + (Math.floor(cyclesSinceEpoch) + 0.5) * SYNODIC_MONTH;
  const nextFullJD = fullMoonJD >= jd ? fullMoonJD : fullMoonJD + SYNODIC_MONTH;
  const nextNewJD = NEW_MOON_EPOCH_JD + (Math.floor(cyclesSinceEpoch) + 1) * SYNODIC_MONTH;

  return {
    illumination: Math.max(0, Math.min(100, illumination)),
    phaseName,
    daysInCycle,
    nextFullMoon: jdToDate(nextFullJD).toLocaleDateString("en-CA"),
    nextNewMoon: jdToDate(nextNewJD).toLocaleDateString("en-CA"),
  };
}

// --- Lunar position (Schlyter, main perturbations) ---

function moonRaDec(jd: number): { raDeg: number; decDeg: number } {
  const d = jd - 2451543.5; // days since 1999-12-31 0:00 UT

  const N = rev(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = rev(318.0634 + 0.1643573223 * d);
  const e = 0.0549;
  const a = 60.2666;
  const M = rev(115.3654 + 13.0649929509 * d);

  const Ms = rev(356.047 + 0.9856002585 * d); // sun mean anomaly
  const ws = 282.9404 + 4.70935e-5 * d;
  const Ls = rev(Ms + ws); // sun mean longitude
  const Lm = rev(N + w + M); // moon mean longitude
  const Dm = rev(Lm - Ls); // mean elongation
  const F = rev(Lm - N); // argument of latitude

  // Eccentric anomaly (two iterations, plenty for the moon's small e)
  let E = M + (180 / Math.PI) * e * sind(M) * (1 + e * cosd(M));
  E = E - (E - (180 / Math.PI) * e * sind(E) - M) / (1 - e * cosd(E));

  const xv = a * (cosd(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * sind(E);
  const r = Math.hypot(xv, yv);
  const v = rev(atan2d(yv, xv));

  const xh = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i));
  const yh = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i));
  const zh = r * (sind(v + w) * sind(i));

  let lon = rev(atan2d(yh, xh));
  let lat = atan2d(zh, Math.hypot(xh, yh));

  // Main perturbations (degrees)
  lon +=
    -1.274 * sind(M - 2 * Dm) +
    0.658 * sind(2 * Dm) -
    0.186 * sind(Ms) -
    0.059 * sind(2 * M - 2 * Dm) -
    0.057 * sind(M - 2 * Dm + Ms) +
    0.053 * sind(M + 2 * Dm) +
    0.046 * sind(2 * Dm - Ms) +
    0.041 * sind(M - Ms) -
    0.035 * sind(Dm) -
    0.031 * sind(M + Ms) -
    0.015 * sind(2 * F - 2 * Dm) +
    0.011 * sind(M - 4 * Dm);
  lat +=
    -0.173 * sind(F - 2 * Dm) -
    0.055 * sind(M - F - 2 * Dm) -
    0.046 * sind(M + F - 2 * Dm) +
    0.033 * sind(F + 2 * Dm) +
    0.017 * sind(2 * M + F);
  lon = rev(lon);

  const ecl = 23.4393 - 3.563e-7 * d;
  const xg = cosd(lon) * cosd(lat);
  const yg = sind(lon) * cosd(lat);
  const zg = sind(lat);
  const xe = xg;
  const ye = yg * cosd(ecl) - zg * sind(ecl);
  const ze = yg * sind(ecl) + zg * cosd(ecl);

  return { raDeg: rev(atan2d(ye, xe)), decDeg: atan2d(ze, Math.hypot(xe, ye)) };
}

/** Greenwich mean sidereal time (degrees) at a Julian day. */
function gmstDeg(jd: number): number {
  return rev(280.46061837 + 360.98564736629 * (jd - 2451545.0));
}

// --- Sydney time helpers ---

function sydneyOffsetMinutes(d: Date): number {
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const syd = new Date(d.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  return Math.round((syd.getTime() - utc.getTime()) / 60000);
}

function sydneyMidnightUTCms(date: Date): number {
  const dstr = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(date);
  const [Y, M, D] = dstr.split("-").map(Number);
  const off = sydneyOffsetMinutes(date);
  return Date.UTC(Y, M - 1, D) - off * 60000;
}

function msToSydneyClock(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function sydneyHourOf(ms: number): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Australia/Sydney", hour: "2-digit", hour12: false }).format(
      new Date(ms)
    ),
    10
  );
}

// --- Moon event scan (transit, anti-transit, rise, set) ---

interface MoonEvents {
  upperTransit: number | null; // UT ms
  lowerTransit: number | null;
  rise: number | null;
  set: number | null;
}

function moonEvents(date: Date): MoonEvents {
  const start = sydneyMidnightUTCms(date);
  const stepMin = 10;
  const steps = Math.ceil((24 * 60) / stepMin); // one Sydney day

  const t: number[] = [];
  const alt: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const ms = start + k * stepMin * 60000;
    const jd = ms / 86400000 + 2440587.5;
    const { raDeg, decDeg } = moonRaDec(jd);
    const lstDeg = rev(gmstDeg(jd) + LON_OBS);
    let ha = lstDeg - raDeg;
    ha = ((ha + 180) % 360 + 360) % 360 - 180; // (-180, 180]
    const a = asind(sind(LAT_OBS) * sind(decDeg) + cosd(LAT_OBS) * cosd(decDeg) * cosd(ha));
    t.push(ms);
    alt.push(a);
  }

  const ev: MoonEvents = { upperTransit: null, lowerTransit: null, rise: null, set: null };

  const lerp = (i: number, target: number) => {
    // altitude crossing between i-1 and i at value `target`
    const frac = (target - alt[i - 1]) / (alt[i] - alt[i - 1]);
    return t[i - 1] + frac * (t[i] - t[i - 1]);
  };

  for (let i = 1; i < alt.length; i++) {
    if (ev.rise === null && alt[i - 1] < MOON_H0 && alt[i] >= MOON_H0) ev.rise = lerp(i, MOON_H0);
    if (ev.set === null && alt[i - 1] >= MOON_H0 && alt[i] < MOON_H0) ev.set = lerp(i, MOON_H0);
  }
  for (let i = 1; i < alt.length - 1; i++) {
    if (ev.upperTransit === null && alt[i] > alt[i - 1] && alt[i] >= alt[i + 1]) ev.upperTransit = t[i];
    if (ev.lowerTransit === null && alt[i] < alt[i - 1] && alt[i] <= alt[i + 1]) ev.lowerTransit = t[i];
  }
  return ev;
}

// --- Windows ---

function windowFrom(centerMs: number, halfMinutes: number, name: "major" | "minor", intensity: SolunarWindow["intensity"]): SolunarWindow {
  return {
    start: msToSydneyClock(centerMs - halfMinutes * 60000),
    end: msToSydneyClock(centerMs + halfMinutes * 60000),
    centerHour: sydneyHourOf(centerMs),
    name,
    intensity,
  };
}

export function getSolunarActivity(date: Date = new Date()): SolunarActivity {
  const moonPhase = calculateMoonPhase(date);
  const ev = moonEvents(date);

  // Strong feeding near new and full moon.
  const strong = moonPhase.illumination >= 90 || moonPhase.illumination <= 10;

  const todayMajorWindows: SolunarWindow[] = [];
  if (ev.upperTransit !== null) todayMajorWindows.push(windowFrom(ev.upperTransit, 60, "major", strong ? "high" : "high"));
  if (ev.lowerTransit !== null) todayMajorWindows.push(windowFrom(ev.lowerTransit, 60, "major", strong ? "high" : "medium"));

  const todayMinorWindows: SolunarWindow[] = [];
  if (ev.rise !== null) todayMinorWindows.push(windowFrom(ev.rise, 45, "minor", strong ? "high" : "medium"));
  if (ev.set !== null) todayMinorWindows.push(windowFrom(ev.set, 45, "minor", strong ? "high" : "medium"));

  todayMajorWindows.sort((a, b) => a.centerHour - b.centerHour);
  todayMinorWindows.sort((a, b) => a.centerHour - b.centerHour);

  // Best upcoming window (nearest major after now, else first).
  const nowHour = sydneyHourOf(Date.now());
  const upcomingMajor = todayMajorWindows.find((w) => w.centerHour >= nowHour);
  const bestWindow = upcomingMajor || todayMajorWindows[0] || todayMinorWindows[0] || null;

  // Phase-based activity read (fixed the never-firing waning branch).
  let fishActivityForecast: string;
  const p = moonPhase.phaseName;
  if (p === "full" || p === "new") {
    fishActivityForecast = "Highest activity expected. Spring tides amplify current and feeding.";
  } else if (p === "first-quarter" || p === "last-quarter") {
    fishActivityForecast = "Moderate activity. Neap tides reduce current strength.";
  } else if (p.indexOf("waxing") === 0) {
    fishActivityForecast = "Building activity toward the full moon. Kings increasingly active.";
  } else {
    fishActivityForecast = "Easing off after the full moon, still worth it around the windows and dawn/dusk.";
  }

  const explanation =
    "Feeding windows come from the moon's actual position over Sydney. The two major windows are the roughly two hours around the moon's transit (directly overhead) and its opposite passage (underfoot); the two minor windows are the hour or so around moonrise and moonset. Fish tend to feed hardest through these windows, and hardest of all near the new and full moon when tides run strongest. Times are Sydney local and are a guide, not a guarantee.";

  return {
    moonPhase,
    todayMajorWindows,
    todayMinorWindows,
    bestWindow,
    moonrise: ev.rise !== null ? msToSydneyClock(ev.rise) : null,
    moonset: ev.set !== null ? msToSydneyClock(ev.set) : null,
    transit: ev.upperTransit !== null ? msToSydneyClock(ev.upperTransit) : null,
    fishActivityForecast,
    explanation,
  };
}

/** Combined windows (kept for compatibility). */
export function calculateSolunarWindows(date: Date = new Date()): SolunarWindow[] {
  const a = getSolunarActivity(date);
  return [...a.todayMajorWindows, ...a.todayMinorWindows];
}

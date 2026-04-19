/**
 * Sydney timezone utilities.
 *
 * All date/time logic in this app must go through these helpers
 * to avoid timezone bugs on UTC servers (Vercel) and non-Sydney browsers.
 */

const TZ = "Australia/Sydney";

/** Get the current hour (0-23) in Sydney timezone. Handles AEST/AEDT automatically. */
export function getSydneyHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-AU", { hour: "numeric", hour12: false, timeZone: TZ }).format(new Date())
  );
}

/** Get today's date string (YYYY-MM-DD) in Sydney timezone. */
export function getSydneyDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Get the Sydney UTC offset in hours for the current moment.
 * Returns +11 during AEDT (Oct–Apr) or +10 during AEST (Apr–Oct).
 */
export function getSydneyOffsetHours(): number {
  const now = new Date();
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const sydStr = now.toLocaleString("en-US", { timeZone: TZ });
  const diffMs = new Date(sydStr).getTime() - new Date(utcStr).getTime();
  return Math.round(diffMs / (60 * 60 * 1000));
}

/** Get the Sydney UTC offset as a string like "+11:00" or "+10:00". */
export function getSydneyOffsetStr(): string {
  const offset = getSydneyOffsetHours();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${sign}${String(abs).padStart(2, "0")}:00`;
}

/**
 * Convert a local Sydney timestamp (e.g. "2026-03-16 14:00:00" from Willyweather)
 * to epoch milliseconds, using the current dynamic AEST/AEDT offset.
 */
export function sydneyLocalToMs(dt: string): number {
  const iso = dt.includes("T") ? dt : dt.replace(" ", "T");
  return new Date(iso + getSydneyOffsetStr()).getTime();
}

/**
 * Extract the Sydney hour (0-23) from a timestamp string.
 * Handles both ISO and "YYYY-MM-DD HH:MM:SS" formats.
 */
export function extractSydneyHour(ts: string): number {
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T");
  const d = new Date(iso);
  return parseInt(
    new Intl.DateTimeFormat("en-AU", { hour: "numeric", hour12: false, timeZone: TZ }).format(d)
  );
}

/**
 * Get the weekday name for a YYYY-MM-DD date string in Sydney timezone.
 */
export function getSydneyDayName(dateStr: string): string {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Use noon to avoid day-rollback when converting to UTC
  const d = new Date(dateStr + "T12:00:00" + getSydneyOffsetStr());
  return DAY_NAMES[d.getUTCDay()];
}

/**
 * Determine time-of-day category from a Sydney hour.
 */
export function getTimeOfDay(hour?: number): "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk" {
  const h = hour ?? getSydneyHour();
  if (h < 5) return "night";
  if (h < 6) return "dawn";
  if (h < 10) return "morning";
  if (h < 14) return "midday";
  if (h < 17) return "afternoon";
  if (h < 19) return "dusk";
  return "night";
}

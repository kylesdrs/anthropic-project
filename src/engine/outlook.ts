/**
 * 5-Day Outlook engine.
 *
 * Merges Willyweather (days 1-3, primary) and Open-Meteo (days 1-5,
 * fallback/extension) forecast data into per-day dive condition summaries.
 * Runs each day's morning conditions through the dive score calculator.
 */

import type { SwellConditions } from "../data/swell";
import type { OpenMeteoDay } from "../data/open-meteo";
import type { RainfallData } from "../data/bom";
import { northernBeachesSites, type DiveSite } from "../sites/northern-beaches";
import { estimateVisibility, estimateCurrentStrength, type VisibilityEstimate } from "./visibility";
import { calculateDiveScore, type DiveScore } from "./dive-score";
import { calculateKingfishScore } from "./kingfish";
import { getSydneyDayName } from "../utils/sydney-time";

// --- Types ---

export interface OutlookDay {
  date: string; // YYYY-MM-DD
  dayName: string; // "Mon", "Tue", etc.
  isToday: boolean;
  diveScore: number; // 1-10
  scoreLabel: string;
  swell: {
    height: number;
    period: number;
    direction: string;
  };
  wind: {
    speed: number;
    direction: string;
  };
  rainProbability: number;
  precis: string;
  summary: string; // One-line conditions summary
  source: "WW" | "OM" | "WW+OM"; // Data source indicator
  kingfishScore: number; // 0-100 normalized kingfish likelihood
  kingfishRating: string; // Poor / Marginal / Fair / Good / Excellent
}

export interface FiveDayOutlook {
  days: OutlookDay[];
  generatedAt: string;
  scoredSite: string; // name of the site used for scoring
}

// --- Helpers ---


/**
 * Extract morning (6am-10am) averages from Willyweather hourly forecast
 * entries for a given date string (YYYY-MM-DD).
 */
function wwMorningAvg(
  entries: { dateTime: string; [k: string]: unknown }[],
  date: string,
  valueKey: string
): number | null {
  // WW timestamps: "YYYY-MM-DD HH:MM:SS"
  const morning = entries.filter((e) => {
    const dt = e.dateTime as string;
    if (!dt.startsWith(date)) return false;
    const hour = parseInt(dt.substring(11, 13));
    return hour >= 6 && hour <= 10;
  });
  if (morning.length === 0) return null;
  const values = morning.map((e) => e[valueKey] as number).filter((v) => v != null);
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function wwMorningDir(
  entries: { dateTime: string; directionText?: string; direction?: number }[],
  date: string
): { text: string; deg: number } | null {
  const morning = entries.filter((e) => {
    if (!e.dateTime.startsWith(date)) return false;
    const hour = parseInt(e.dateTime.substring(11, 13));
    return hour >= 6 && hour <= 10;
  });
  if (morning.length === 0) return null;
  // Take the middle entry for direction (less noisy than averaging degrees)
  const mid = morning[Math.floor(morning.length / 2)];
  return {
    text: mid.directionText ?? "",
    deg: mid.direction ?? 0,
  };
}

/** Generate a one-line summary from conditions. */
function generateSummary(
  swellHeight: number,
  windSpeed: number,
  windDir: string,
  rain: number,
  dayIndex: number,
  prevRain?: number
): string {
  const OFFSHORE = new Set(["W", "WSW", "SW", "WNW", "NW", "NNW"]);
  const isOffshore = OFFSHORE.has(windDir);

  if (rain > 50) return "Rain expected — vis will suffer";
  if (swellHeight > 1.5) return "Big swell — exposed sites dangerous";
  if (swellHeight < 0.7 && isOffshore && rain < 20) return "Clean conditions — could be great";
  if (dayIndex >= 2 && (prevRain ?? 0) < 20 && swellHeight < 1.0) return "Recovery day — vis should be solid";
  if (swellHeight < 1.0 && rain < 30) {
    if (isOffshore) return "Light offshore, looks clean";
    return "Small swell, manageable conditions";
  }
  if (rain >= 30 && rain <= 50) return "Shower risk — vis may drop";
  if (swellHeight >= 1.0 && swellHeight <= 1.5) return "Moderate swell — site selection matters";
  return "Check conditions before heading out";
}

// --- Main ---

/**
 * Generate a 5-day outlook by merging Willyweather and Open-Meteo data.
 *
 * Merge logic:
 * - Days 1-3: Willyweather primary for swell, Open-Meteo supplements wind/rain
 * - Days 4-5: Open-Meteo only
 * - Source flagged per day for transparency
 */
export function generate5DayOutlook(
  wwData: SwellConditions | null,
  omData: OpenMeteoDay[] | null,
  site?: DiveSite,
  currentRainfall?: RainfallData,
): FiveDayOutlook | null {
  // If both data sources are unavailable, don't produce a misleading outlook.
  // Scoring zeros as "Great 8.8" is worse than showing nothing.
  if (!wwData && !omData) {
    return null;
  }

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

  // Build 5 dates starting from today
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }));
  }

  // Index Open-Meteo data by date
  const omByDate = new Map<string, OpenMeteoDay>();
  if (omData) {
    for (const day of omData) {
      omByDate.set(day.date, day);
    }
  }

  // Extract WW forecast entries
  const wwSwell = wwData?.forecast ?? [];
  const wwWind = wwData?.windForecast ?? [];
  const wwWeather = wwData?.weatherForecast ?? [];

  // Use the specified site for scoring, or default to first site
  const bestSite = site ?? northernBeachesSites[0];

  // --- First pass: extract per-day conditions ---
  interface DayConditions {
    date: string;
    dayName: string;
    hasWW: boolean;
    hasOM: boolean;
    swell: { height: number; period: number; direction: string; directionDeg: number };
    wind: { speed: number; gust: number; direction: string; directionDeg: number };
    rainProbability: number;
    precis: string;
    cloudCover: number;
    source: OutlookDay["source"];
    waterTemp: number | null;
  }

  const dayConditions: (DayConditions | null)[] = dates.map((date, idx) => {
    const om = omByDate.get(date);
    const dayName = idx === 0 ? "Today" : getSydneyDayName(date);

    const wwSwellH = wwMorningAvg(
      wwSwell.map((e) => ({ dateTime: e.timestamp, height: e.height })),
      date, "height"
    );
    const wwSwellP = wwMorningAvg(
      wwSwell.map((e) => ({ dateTime: e.timestamp, period: e.period })),
      date, "period"
    );
    const wwSwellDir = wwMorningDir(
      wwSwell.map((e) => ({
        dateTime: e.timestamp, directionText: e.direction, direction: e.directionDeg,
      })),
      date
    );
    const wwWindS = wwMorningAvg(
      wwWind.map((e) => ({ dateTime: e.timestamp, speed: e.speed })),
      date, "speed"
    );
    const wwWindDir = wwMorningDir(
      wwWind.map((e) => ({
        dateTime: e.timestamp, directionText: e.direction, direction: e.directionDeg,
      })),
      date
    );

    const wwRainEntries = wwWeather.filter((e) => e.timestamp.startsWith(date));
    const wwRain = wwRainEntries.length > 0
      ? Math.max(...wwRainEntries.map((e) => e.rainProbability ?? 0))
      : null;
    const wwPrecis = wwRainEntries.length > 0 ? wwRainEntries[0].precis : null;

    const hasWW = wwSwellH !== null;
    const hasOM = om !== null;
    if (!hasWW && !hasOM) return null;

    const swell = {
      height: wwSwellH ?? om?.swell.height ?? 0,
      period: Math.round(wwSwellP ?? om?.swell.period ?? 0),
      direction: wwSwellDir?.text ?? om?.swell.direction ?? "E",
      directionDeg: wwSwellDir?.deg ?? om?.swell.directionDeg ?? 90,
    };

    const wind = {
      speed: Math.round(wwWindS ?? om?.wind.speed ?? 0),
      gust: Math.round((wwWindS ?? om?.wind.speed ?? 0) * 1.4),
      direction: wwWindDir?.text ?? om?.wind.direction ?? "W",
      directionDeg: wwWindDir?.deg ?? om?.wind.directionDeg ?? 270,
    };

    const rainProbability = wwRain ?? om?.rainProbability ?? 0;
    const precis = wwPrecis ?? om?.precis ?? "Unknown";
    const cloudCover = om?.cloudCover ?? (precis.toLowerCase().includes("overcast") ? 80 : 30);

    let source: OutlookDay["source"];
    if (hasWW && hasOM) source = "WW+OM";
    else if (hasWW) source = "WW";
    else source = "OM";

    return {
      date, dayName, hasWW, hasOM, swell, wind,
      rainProbability, precis, cloudCover, source,
      waterTemp: om?.waterTemp ?? null,
    };
  });

  // --- Build multi-day rainfall context ---
  // Convert rain probability to estimated mm: >50% ≈ 8mm, >30% ≈ 3mm, else 0.
  // Carry forward across days so day N's last48h includes day N-1's rain.
  const dailyRainMm: number[] = dayConditions.map((dc) => {
    if (!dc) return 0;
    const p = dc.rainProbability;
    return p > 50 ? 8 : p > 30 ? 3 : 0;
  });

  function buildRainfallForDay(idx: number): RainfallData {
    // Day 0 (today): use real BOM rainfall if available
    if (idx === 0 && currentRainfall) {
      return currentRainfall;
    }

    const last24h = dailyRainMm[idx] ?? 0;
    const last48h = last24h + (dailyRainMm[idx - 1] ?? 0);
    const last72h = last48h + (dailyRainMm[idx - 2] ?? 0);

    // Walk backwards to find last significant rain day
    let daysSinceSignificantRain = 7;
    for (let d = idx; d >= Math.max(0, idx - 4); d--) {
      if (dailyRainMm[d] >= 8) {
        daysSinceSignificantRain = idx - d;
        break;
      }
    }
    // If today has real data showing recent rain, factor it in for near-future days
    if (currentRainfall && daysSinceSignificantRain > idx) {
      daysSinceSignificantRain = Math.min(
        daysSinceSignificantRain,
        currentRainfall.daysSinceSignificantRain + idx
      );
    }

    return { last24h, last48h, last72h, daysSinceSignificantRain };
  }

  // --- Infer swell trend from day-to-day height changes ---
  function inferSwellTrend(idx: number): "building" | "holding" | "dropping" | undefined {
    const cur = dayConditions[idx]?.swell.height;
    if (cur == null) return undefined;
    const prev = dayConditions[idx - 1]?.swell.height;
    const next = dayConditions[idx + 1]?.swell.height;

    if (prev != null && next != null) {
      if (cur > prev + 0.2 || next > cur + 0.2) return "building";
      if (cur < prev - 0.2 || next < cur - 0.2) return "dropping";
      return "holding";
    }
    if (prev != null) {
      if (cur > prev + 0.2) return "building";
      if (cur < prev - 0.2) return "dropping";
      return "holding";
    }
    // Day 0 with real swell data: use the live trend if available
    if (idx === 0 && wwData?.trend) return wwData.trend;
    return undefined;
  }

  // --- Second pass: score each day ---
  const days = (dayConditions.map((dc, idx) => {
    if (!dc) return null;

    const { date, dayName, swell, wind, rainProbability, precis, cloudCover, source, waterTemp } = dc;
    const rainfall = buildRainfallForDay(idx);
    const swellTrend = inferSwellTrend(idx);
    const month = parseInt(date.substring(5, 7));
    const cloudDesc = cloudCover >= 80 ? "Overcast" : cloudCover >= 50 ? "Cloudy" : "Partly cloudy";

    const visEstimate: VisibilityEstimate = estimateVisibility(
      {
        rainfall,
        swell: {
          timestamp: date,
          height: swell.height,
          period: swell.period,
          direction: swell.direction,
          directionDeg: swell.directionDeg,
        },
        swellTrend,
        windDirection: wind.direction,
        windSpeed: wind.speed,
        windGust: wind.gust,
        tides: {
          predictions: [],
          currentState: "mid_rising" as const,
          nextHigh: null,
          nextLow: null,
        },
        month,
        seaSurfaceTemp: waterTemp,
        cloud: cloudDesc,
      },
      bestSite
    );

    const diveScore: DiveScore = calculateDiveScore({
      visibility: visEstimate,
      sharkRisk: null,
      swell: {
        timestamp: date,
        height: swell.height,
        period: swell.period,
        direction: swell.direction,
        directionDeg: swell.directionDeg,
      },
      windSpeed: wind.speed,
      windGust: wind.gust,
      windDirection: wind.direction,
      airTemp: 22,
      waterTemp,
      site: bestSite,
      timeOfDay: "morning",
      cloud: cloudDesc,
      tideState: "mid_rising",
    });

    const currentStrength = estimateCurrentStrength(swell.height, "mid_rising");
    const kingfishResult = calculateKingfishScore({
      month,
      sst: waterTemp,
      waterTemp: waterTemp ?? 21,
      estimatedVis: visEstimate.metres,
      currentStrength,
      tideState: "mid_rising",
      windDirection: wind.direction,
      windSpeed: wind.speed,
      pressure: 1013,
      timeOfDay: "dawn",
      hour: 6,
    });

    const prevRain = idx > 0 ? (omByDate.get(dates[idx - 1])?.rainProbability ?? 0) : undefined;
    const summary = generateSummary(
      swell.height, wind.speed, wind.direction, rainProbability, idx, prevRain
    );

    return {
      date,
      dayName,
      isToday: date === todayStr,
      diveScore: diveScore.overall,
      scoreLabel: diveScore.label,
      swell: {
        height: swell.height,
        period: swell.period,
        direction: swell.direction,
      },
      wind: {
        speed: wind.speed,
        direction: wind.direction,
      },
      rainProbability,
      precis,
      summary,
      source,
      kingfishScore: kingfishResult.normalizedScore,
      kingfishRating: kingfishResult.rating as string,
    };
  }).filter((d): d is OutlookDay => d !== null));

  return {
    days,
    generatedAt: new Date().toISOString(),
    scoredSite: bestSite.name,
  };
}

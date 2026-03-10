/**
 * Dive briefing generator.
 *
 * Main orchestrator — calls all data fetchers and prediction
 * functions, then assembles a complete DiveBriefing.
 *
 * This is the single entry point for the API. Call generateBriefing()
 * and get back everything needed for the frontend.
 */

import { fetchWeatherData, type WeatherConditions } from "../data/bom";
import {
  fetchSwellData,
  type SwellConditions,
  type SwellForecastPoint,
  type WindForecastPoint,
} from "../data/swell";
import {
  fetchSharkActivity,
  type SharkActivitySummary,
} from "../data/sharksmart";
import { northernBeachesSites, type DiveSite } from "../sites/northern-beaches";
import { rankSites, type SiteRanking } from "./site-rank";
import type { VisibilityEstimate } from "./visibility";
import { estimateVisibility } from "./visibility";
import { fetchOpenMeteo5Day } from "../data/open-meteo";
import { generate5DayOutlook, type FiveDayOutlook, type OutlookDay } from "./outlook";

// --- Types ---

export interface DataSourceStatus {
  weather: { available: boolean; source: string };
  swell: { available: boolean; source: string };
  shark: { available: boolean; source: string };
}

export interface DiveBriefing {
  generatedAt: string;
  forecastHour: number | null; // null = current conditions, 0-23 = forecast for that AEST hour
  selectedSiteId: string | null; // null = all sites, or specific site id
  timeOfDay: "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk";
  dataStatus: DataSourceStatus;
  conditions: {
    weather: WeatherConditions | null;
    swell: SwellConditions | null;
    sharkActivity: SharkActivitySummary;
  };
  visibility: VisibilityEstimate | null;
  siteRankings: SiteRanking[];
  recommendation: BriefingRecommendation;
  outlook: FiveDayOutlook | null;
}

export interface BriefingRecommendation {
  go: boolean;
  confidence: "high" | "medium" | "low";
  summary: string;
  bestSite: string;
  bestTimeWindow: string;
  keyFactors: string[];
}

// --- Sydney timezone helpers ---

/** Get the current hour in Australia/Sydney timezone (handles AEST/AEDT automatically). */
function getSydneyHour(): number {
  const sydneyTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" })
  );
  return sydneyTime.getHours();
}

/** Get today's date string (YYYY-MM-DD) in Sydney timezone. */
function getSydneyDateStr(): string {
  const sydneyTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" })
  );
  return sydneyTime.toISOString().slice(0, 10);
}

/**
 * Get the Sydney UTC offset in hours for the current moment.
 * Returns +11 during AEDT (Oct–Apr) or +10 during AEST (Apr–Oct).
 */
function getSydneyOffsetHours(): number {
  const now = new Date();
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const sydStr = now.toLocaleString("en-US", { timeZone: "Australia/Sydney" });
  const diffMs = new Date(sydStr).getTime() - new Date(utcStr).getTime();
  return Math.round(diffMs / (60 * 60 * 1000));
}

// --- Time of day helper ---

function getTimeOfDay(
  hour?: number
): "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk" {
  const h = hour ?? getSydneyHour();
  if (h < 5) return "night";     // 0-4: pitch dark
  if (h < 6) return "dawn";      // 5: pre-sunrise twilight
  if (h < 10) return "morning";  // 6-9: good daylight
  if (h < 14) return "midday";   // 10-13: peak daylight
  if (h < 17) return "afternoon"; // 14-16: good daylight
  if (h < 19) return "dusk";     // 17-18: sunset / fading light
  return "night";                 // 19-23: dark
}

// --- Main generator ---

/**
 * Generate a complete dive briefing.
 *
 * Fetches all data sources, runs all prediction engines,
 * and returns a structured briefing object.
 */
export async function generateBriefing(options?: {
  hour?: number;
  sites?: DiveSite[];
  siteId?: string;
}): Promise<DiveBriefing> {
  const timeOfDay = getTimeOfDay(options?.hour);
  const sites = options?.sites ?? northernBeachesSites;
  // Resolve the selected site for per-site outlook scoring
  const selectedSite = options?.siteId
    ? sites.find((s) => s.id === options.siteId)
    : undefined;

  // Fetch all data in parallel
  const [weather, swell, sharkActivity, omData] = await Promise.all([
    fetchWeatherData(),
    fetchSwellData(),
    fetchSharkActivity(),
    fetchOpenMeteo5Day(),
  ]);

  // Track which data sources are available
  // Seed shark data is generated placeholder data, not real observations
  const hasRealSharkData = sharkActivity.source === "live" || sharkActivity.source === "local";
  const dataStatus: DataSourceStatus = {
    weather: {
      available: weather !== null,
      source: weather?.source ?? "unavailable",
    },
    swell: {
      available: swell !== null,
      source: swell?.source ?? "unavailable",
    },
    shark: {
      available: hasRealSharkData,
      source: hasRealSharkData ? sharkActivity.source : "unavailable",
    },
  };

  // If a specific hour is requested, override current swell/wind with
  // interpolated forecast data (Willyweather gives 3-hourly entries, so
  // we interpolate for accuracy at the exact requested hour).
  const forecastHour = options?.hour;
  if (forecastHour !== undefined && swell) {
    const forecastSwell = interpolateSwellForHour(swell.forecast, forecastHour);
    if (forecastSwell) {
      swell.current = {
        timestamp: forecastSwell.timestamp,
        height: forecastSwell.height,
        period: forecastSwell.period,
        direction: forecastSwell.direction,
        directionDeg: forecastSwell.directionDeg,
      };
    }
    if (weather && swell.windForecast.length > 0) {
      const forecastWind = interpolateWindForHour(swell.windForecast, forecastHour);
      if (forecastWind) {
        weather.observation.windDirection = forecastWind.direction;
        weather.observation.windSpeed = forecastWind.speed;
        weather.observation.windDirectionDeg = forecastWind.directionDeg;
      }
    }
  }

  // General visibility estimate (only if we have the required data)
  let visibility: VisibilityEstimate | null = null;
  if (weather && swell) {
    const month = new Date().getMonth() + 1;
    visibility = estimateVisibility({
      rainfall: weather.rainfall,
      swell: swell.current,
      swellTrend: swell.trend,
      windDirection: weather.observation.windDirection,
      windSpeed: weather.observation.windSpeed,
      windGust: weather.observation.windGust,
      tides: weather.tides,
      month,
      seaSurfaceTemp: weather.seaSurfaceTemp,
      cloud: weather.observation.cloud,
    });
  }

  // Rank sites only if we have enough data
  let siteRankings: SiteRanking[] = [];
  if (weather && swell) {
    siteRankings = rankSites(sites, {
      weather,
      swell,
      sharkActivity,
      timeOfDay,
      hasRealSharkData,
    });
  }

  // When a specific site is selected, reorder rankings so it comes first.
  // This makes generateRecommendation focus on the selected site.
  if (selectedSite && siteRankings.length > 0) {
    const idx = siteRankings.findIndex((r) => r.site.id === selectedSite.id);
    if (idx > 0) {
      const picked = siteRankings[idx];
      siteRankings = [picked, ...siteRankings.slice(0, idx), ...siteRankings.slice(idx + 1)];
    }
  }

  // Use site-specific visibility when a site is selected
  const activeVisibility = selectedSite
    ? siteRankings[0]?.visibility
      ? {
          metres: siteRankings[0].visibility.metres,
          rating: siteRankings[0].visibility.rating as VisibilityEstimate["rating"],
          confidence: siteRankings[0].visibility.confidence as VisibilityEstimate["confidence"],
          factors: siteRankings[0].visibility.factors,
          explanation: siteRankings[0].visibility.explanation,
        }
      : visibility
    : visibility;

  // Generate 5-day outlook (needed before recommendation for forward-looking advice)
  const outlook = generate5DayOutlook(swell, omData, selectedSite);

  // Generate recommendation
  const recommendation = generateRecommendation(
    siteRankings,
    activeVisibility,
    weather,
    swell,
    timeOfDay,
    outlook
  );

  return {
    generatedAt: new Date().toISOString(),
    forecastHour: forecastHour ?? null,
    selectedSiteId: selectedSite?.id ?? null,
    timeOfDay,
    dataStatus,
    conditions: {
      weather,
      swell,
      sharkActivity,
    },
    visibility: activeVisibility,
    siteRankings,
    recommendation,
    outlook,
  };
}

// --- Forecast hour helper ---

/**
 * Convert a Willyweather Sydney-local timestamp to milliseconds.
 * Handles both "2026-02-12 14:00:00" and ISO formats.
 * Dynamically detects AEST (+10) vs AEDT (+11) based on current DST.
 */
function toSydneyMs(ts: string): number {
  const offset = getSydneyOffsetHours();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const tz = `${sign}${String(abs).padStart(2, "0")}:00`;
  return new Date(ts.replace(" ", "T") + tz).getTime();
}

/**
 * Build the Sydney target timestamp for a given hour today.
 */
function buildTargetMs(targetHour: number): number {
  const todayStr = getSydneyDateStr();
  const targetStr = `${todayStr} ${String(targetHour).padStart(2, "0")}:00:00`;
  return toSydneyMs(targetStr);
}

/**
 * Interpolate swell forecast for an exact hour.
 * Willyweather gives 3-hourly entries — this linearly interpolates
 * between the two surrounding entries for accurate values at any hour.
 */
function interpolateSwellForHour(
  entries: SwellForecastPoint[],
  targetHour: number
): SwellForecastPoint | null {
  if (entries.length === 0) return null;

  const targetMs = buildTargetMs(targetHour);

  // Find entries immediately before and after target
  let before: SwellForecastPoint | null = null;
  let after: SwellForecastPoint | null = null;
  let beforeMs = -Infinity;
  let afterMs = Infinity;

  for (const entry of entries) {
    const entryMs = toSydneyMs(entry.timestamp);
    if (entryMs <= targetMs && entryMs > beforeMs) {
      before = entry;
      beforeMs = entryMs;
    }
    if (entryMs > targetMs && entryMs < afterMs) {
      after = entry;
      afterMs = entryMs;
    }
  }

  // If we have both sides, linearly interpolate
  if (before && after) {
    const range = afterMs - beforeMs;
    const t = range > 0 ? (targetMs - beforeMs) / range : 0;
    return {
      timestamp: before.timestamp,
      height: Math.round((before.height + (after.height - before.height) * t) * 10) / 10,
      period: Math.round(before.period + (after.period - before.period) * t),
      direction: t < 0.5 ? before.direction : after.direction,
      directionDeg: Math.round(before.directionDeg + (after.directionDeg - before.directionDeg) * t),
    };
  }

  // Only one side available — return the closest entry
  return before ?? after ?? entries[0];
}

/**
 * Interpolate wind forecast for an exact hour.
 */
function interpolateWindForHour(
  entries: WindForecastPoint[],
  targetHour: number
): WindForecastPoint | null {
  if (entries.length === 0) return null;

  const targetMs = buildTargetMs(targetHour);

  let before: WindForecastPoint | null = null;
  let after: WindForecastPoint | null = null;
  let beforeMs = -Infinity;
  let afterMs = Infinity;

  for (const entry of entries) {
    const entryMs = toSydneyMs(entry.timestamp);
    if (entryMs <= targetMs && entryMs > beforeMs) {
      before = entry;
      beforeMs = entryMs;
    }
    if (entryMs > targetMs && entryMs < afterMs) {
      after = entry;
      afterMs = entryMs;
    }
  }

  if (before && after) {
    const range = afterMs - beforeMs;
    const t = range > 0 ? (targetMs - beforeMs) / range : 0;
    return {
      timestamp: before.timestamp,
      speed: Math.round(before.speed + (after.speed - before.speed) * t),
      gust: Math.round(before.gust + (after.gust - before.gust) * t),
      direction: t < 0.5 ? before.direction : after.direction,
      directionDeg: Math.round(before.directionDeg + (after.directionDeg - before.directionDeg) * t),
    };
  }

  return before ?? after ?? entries[0];
}

// --- Recommendation logic ---

// --- Helpers for natural language generation ---

/** Short site name for conversational use (drop parenthetical suffixes). */
function shortName(name: string): string {
  // "Freshwater Headland (Queenscliff End)" → "Freshie"
  // "North Head (Manly)" → "North Head"
  const nicknames: Record<string, string> = {
    "Bluefish Point": "Bluefish",
    "Freshwater Headland (Queenscliff End)": "Freshie",
    "Long Reef": "Long Reef",
    "Narrabeen Head": "Narra",
    "North Head (Manly)": "North Head",
    "Curl Curl Headland": "Curly",
    "Dee Why Head": "Dee Why",
  };
  return nicknames[name] ?? name.replace(/\s*\(.*\)/, "");
}

/** Explain why the site is the pick based on its attributes and conditions. */
function siteContextReason(site: SiteRanking): string {
  const depth = site.site.depthRange;
  const avgDepth = (depth.min + depth.max) / 2;

  // Deep site advantage
  if (avgDepth >= 15) {
    return "it's deep enough to dodge the dirty surface water";
  }

  // Sheltered from current swell
  if (site.conditionsFit.swellProtected) {
    return "it's sheltered from the swell";
  }

  // Good conditions fit
  if (site.conditionsFit.windIdeal) {
    return "the wind's offshore there";
  }

  // Low runoff sensitivity
  if (site.site.runoffSensitivity < 0.8) {
    return "it's away from the lagoon outflows";
  }

  // Fallback — reef spillover etc
  if (site.site.id === "bluefish-point") {
    return "the reserve spillover keeps the fish numbers up";
  }

  return "it's your best option right now";
}

/** Describe what's killing the vis in plain language. */
function visCausePhrase(
  site: SiteRanking,
  weather: WeatherConditions,
  swell: SwellConditions
): string {
  const parts: string[] = [];

  // Rain impact
  if (weather.rainfall.last24h >= 10) {
    parts.push("yesterday's rain still washing out");
  } else if (weather.rainfall.last24h >= 5) {
    parts.push("recent rain runoff");
  } else if (weather.rainfall.daysSinceSignificantRain <= 2) {
    const days = weather.rainfall.daysSinceSignificantRain;
    parts.push(days === 0 ? "today's rain" : days === 1 ? "yesterday's rain still flushing through" : "rain from a couple days ago");
  }

  // Swell stirring things up
  if (swell.current.height >= 1.5) {
    parts.push(`${swell.current.height}m of ${swell.current.direction} swell churning things up`);
  } else if (swell.current.height >= 1.0) {
    parts.push(`the ${swell.current.direction} swell stirring up the bottom`);
  }

  // Onshore wind
  const onshore = new Set(["E", "ENE", "NE", "ESE", "SE", "SSE", "S"]);
  if (onshore.has(weather.observation.windDirection) && weather.observation.windSpeed >= 12) {
    parts.push("onshore wind mixing up the surface");
  }

  if (parts.length === 0) return "";
  if (parts.length === 1) return ` from ${parts[0]}`;
  return ` from ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Describe the swell warning for a site in plain language. */
function swellWarningPhrase(site: SiteRanking, swell: SwellConditions): string {
  if (site.conditionsFit.swellOk) return "";

  const ht = swell.current.height;
  const dir = swell.current.direction;
  const name = shortName(site.site.name);

  // Site-specific colour
  if (site.site.id === "long-reef") {
    return `${name}'s a washing machine today — ${ht}m of ${dir} straight onto the platform.`;
  }
  if (site.site.id === "curl-curl-headland" || site.site.id === "dee-why-head") {
    return `${name}'s getting smashed by ${ht}m of ${dir}.`;
  }
  if (site.site.id === "north-head") {
    return `North Head's too hairy with ${ht}m hitting from the ${dir}.`;
  }

  return `${ht}m of ${dir} swell is too much for ${name}.`;
}

/**
 * Find the next significantly better day from the outlook.
 * Returns a phrase like "Friday's looking way better" or null.
 */
function forwardLookPhrase(
  currentScore: number,
  outlook: FiveDayOutlook | null
): string | null {
  if (!outlook || outlook.days.length < 2) return null;

  // Skip today (index 0), look at coming days
  const futureDays = outlook.days.filter((d) => !d.isToday);
  if (futureDays.length === 0) return null;

  // Find the first day that's significantly better (at least 2 points or score >= 6.5)
  const betterDay = futureDays.find(
    (d) => d.diveScore >= currentScore + 2 || (d.diveScore >= 6.5 && currentScore < 5)
  );

  if (!betterDay) {
    // If conditions are bad now but the whole week is bad, say so
    if (currentScore < 4) {
      return "Not much improvement in the forecast either — patience.";
    }
    return null;
  }

  const dayLabel = dayNameToNatural(betterDay.dayName);
  const reason = betterDay.swell.height < 1.0
    ? "with the swell dropping"
    : betterDay.wind.speed < 10
      ? "with lighter winds"
      : "looking cleaner";

  const cap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  if (currentScore < 4) {
    return `I'd hold off — ${dayLabel}'s shaping up way better ${reason}.`;
  }
  return `${cap} looks even better if you can wait.`;
}

function dayNameToNatural(dayName: string): string {
  const map: Record<string, string> = {
    "Today": "later today",
    "Tmrw": "tomorrow",
    "Mon": "Monday",
    "Tue": "Tuesday",
    "Wed": "Wednesday",
    "Thu": "Thursday",
    "Fri": "Friday",
    "Sat": "Saturday",
    "Sun": "Sunday",
  };
  return map[dayName] ?? dayName;
}

/** Natural time advice — "Get in before 10" style. */
function timeAdvicePhrase(
  weather: WeatherConditions,
  swell: SwellConditions,
  timeOfDay: string,
  bestScore: number,
  vis: VisibilityEstimate | null
): string {
  // Bad conditions — no point giving time advice
  const visAwful = vis && vis.metres < 1.5;
  if (bestScore < 5 || visAwful) {
    if (swell.trend === "dropping") {
      return "Swell's dropping so it might come good later, but I wouldn't bank on it";
    }
    return "Give it a miss today";
  }

  const tideState = weather.tides.currentState;

  // Building swell — urgency
  if (swell.trend === "building") {
    if (timeOfDay === "dawn" || timeOfDay === "morning") {
      return "Get in early — swell's building and it'll be worse this arvo";
    }
    return "Go now if you're going — swell's only getting bigger";
  }

  // Morning + likely sea breeze
  if (timeOfDay === "dawn" || timeOfDay === "morning") {
    const onshore = new Set(["E", "ENE", "NE", "ESE", "SE"]);
    if (!onshore.has(weather.observation.windDirection)) {
      return "Get in before 10 — the nor'easter usually kicks in by midday";
    }
    return "Already onshore so don't expect it to get better this arvo";
  }

  // Afternoon
  if (timeOfDay === "afternoon" || timeOfDay === "midday") {
    if (swell.trend === "dropping") {
      return "Swell's easing — tomorrow morning could be mint";
    }
    return "Best window's probably passed — early tomorrow might be better";
  }

  // Rising tide
  if (tideState === "early_rising" || tideState === "mid_rising") {
    return "Tide's pushing in which helps — go now";
  }

  if (weather.tides.nextHigh) {
    const nextHighTime = new Date(weather.tides.nextHigh.time);
    const hoursUntilHigh = (nextHighTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilHigh > 0 && hoursUntilHigh <= 4) {
      const timeStr = nextHighTime.toLocaleTimeString("en-AU", {
        hour: "numeric",
        minute: "2-digit",
      });
      return `Aim for the incoming tide — high's at ${timeStr}`;
    }
  }

  return "Early morning's your best bet";
}

// --- Main recommendation generator ---

function generateRecommendation(
  rankings: SiteRanking[],
  visibility: VisibilityEstimate | null,
  weather: WeatherConditions | null,
  swell: SwellConditions | null,
  timeOfDay: string,
  outlook: FiveDayOutlook | null
): BriefingRecommendation {
  // Night time
  if (timeOfDay === "night") {
    return {
      go: false,
      confidence: "high",
      summary: "It's dark, mate. Can't spear what you can't see. Earliest you'd want to be in is around dawn, 5-6am.",
      bestSite: "None",
      bestTimeWindow: "Wait for first light — 5-6am",
      keyFactors: ["No natural light"],
    };
  }

  // Missing data
  if (!weather || !swell) {
    const missing: string[] = [];
    if (!weather) missing.push("weather");
    if (!swell) missing.push("swell");
    return {
      go: false,
      confidence: "low",
      summary: `Can't get a read on conditions — ${missing.join(" and ")} data's not coming through. Have a look yourself or check back in a bit.`,
      bestSite: "Unknown",
      bestTimeWindow: "Check back later",
      keyFactors: missing.map((s) => `${s}: data unavailable`),
    };
  }

  const bestSite = rankings[0];
  const bestScore = bestSite?.diveScore.overall ?? 0;

  // Site-specific vis
  const siteVis: VisibilityEstimate | null = bestSite?.visibility
    ? {
        metres: bestSite.visibility.metres,
        rating: bestSite.visibility.rating as VisibilityEstimate["rating"],
        confidence: bestSite.visibility.confidence as VisibilityEstimate["confidence"],
        factors: bestSite.visibility.factors,
        explanation: bestSite.visibility.explanation,
      }
    : visibility;

  const go = bestScore >= 5;

  let confidence: BriefingRecommendation["confidence"] = "medium";
  if (siteVis?.confidence === "high" && bestScore >= 7) {
    confidence = "high";
  } else if (siteVis?.confidence === "low" || bestScore < 4) {
    confidence = "low";
  }

  const summary = generateSummary(bestSite, bestScore, siteVis, weather, swell, timeOfDay, outlook);
  const bestTimeWindow = timeAdvicePhrase(weather, swell, timeOfDay, bestScore, siteVis);
  const keyFactors = collectKeyFactors(bestSite, siteVis, weather, swell);

  return {
    go,
    confidence,
    summary,
    bestSite: bestSite?.site.name ?? "None available",
    bestTimeWindow,
    keyFactors,
  };
}

// --- Summary: the main natural-language paragraph ---

function generateSummary(
  bestSite: SiteRanking | undefined,
  bestScore: number,
  vis: VisibilityEstimate | null,
  weather: WeatherConditions,
  swell: SwellConditions,
  timeOfDay: string,
  outlook: FiveDayOutlook | null
): string {
  if (!bestSite) {
    return "No sites to check right now.";
  }

  const name = shortName(bestSite.site.name);
  const visNum = vis ? vis.metres : null;
  const visCause = visCausePhrase(bestSite, weather, swell);
  const forward = forwardLookPhrase(bestScore, outlook);
  const swellWarn = swellWarningPhrase(bestSite, swell);

  // --- EPIC / GREAT (8+) ---
  if (bestScore >= 8) {
    const windDesc = bestSite.conditionsFit.windIdeal
      ? "light offshore winds"
      : `${weather.observation.windSpeed}kt from the ${weather.observation.windDirection}`;
    let text = `Banging day for it. ${name}'s the pick at ${bestScore}`;
    if (visNum !== null && visNum >= 5) {
      text += ` with clean water (${visNum}m vis)`;
    } else if (visNum !== null) {
      text += ` — vis is ${visNum}m which is workable`;
    }
    text += ` and ${windDesc}.`;

    // Time urgency
    if (swell.trend === "building" || (timeOfDay === "morning" || timeOfDay === "dawn")) {
      text += " Get in early before the nor'easter kicks in around midday.";
    }
    return text;
  }

  // --- GOOD (6.5-8) ---
  if (bestScore >= 6.5) {
    const reason = siteContextReason(bestSite);
    let text = `Decent day out there. ${name}'s the go because ${reason}`;
    if (visNum !== null) {
      if (visNum < 2) {
        text += `, but vis is pretty rubbish at ${visNum}m${visCause}`;
      } else if (visNum < 4) {
        text += ` — vis is ${visNum}m${visCause}, so not amazing`;
      } else {
        text += ` with ${visNum}m vis`;
      }
    }
    text += ".";

    if (swellWarn) text += ` ${swellWarn}`;
    if (forward) text += ` ${forward}`;
    return text;
  }

  // --- FAIR (5-6.5) ---
  if (bestScore >= 5) {
    const reason = siteContextReason(bestSite);
    let text = `Pretty average today. ${name}'s your best bet at ${bestScore} — ${reason}`;
    if (visNum !== null) {
      if (visNum < 2) {
        text += `, but vis is rubbish at ${visNum}m${visCause} — you're basically diving blind`;
      } else if (visNum < 4) {
        text += `. Vis is only ${visNum}m${visCause}`;
      } else {
        text += ` with ${visNum}m vis`;
      }
    }
    text += ".";

    if (swellWarn) text += ` ${swellWarn}`;
    if (forward) text += ` ${forward}`;
    return text;
  }

  // --- MARGINAL (3.5-5) ---
  if (bestScore >= 3.5) {
    let text: string;
    if (visNum !== null && visNum < 2) {
      text = `Wouldn't bother today. Vis is ${visNum}m${visCause} — can't see a thing.`;
    } else {
      text = `Pretty ordinary out there. ${name}'s the only option at ${bestScore} but it's not worth the drive.`;
    }

    if (swellWarn) text += ` ${swellWarn}`;
    if (forward) {
      text += ` ${forward}`;
    } else {
      text += " Save your energy.";
    }
    return text;
  }

  // --- POOR / SKIP IT (< 3.5) ---
  {
    let text = "Don't bother today.";

    // Lead with the dominant problem
    if (swell.current.height >= 1.5) {
      text += ` ${swell.current.height}m of ${swell.current.direction} swell`;
      if (visNum !== null && visNum < 3) {
        text += `, vis is shot at ${visNum}m${visCause}`;
      }
      text += ", and it's only getting worse this arvo.";
    } else if (visNum !== null && visNum < 2) {
      text += ` Vis is completely cooked at ${visNum}m${visCause}.`;
    } else {
      text += ` ${name} only scored ${bestScore} — everything's working against you today.`;
    }

    if (forward) {
      text += ` ${forward}`;
    } else {
      text += " Save your energy for when it cleans up.";
    }
    return text;
  }
}

// --- Key factors (structured data for pills) ---

function collectKeyFactors(
  bestSite: SiteRanking | undefined,
  visibility: VisibilityEstimate | null,
  weather: WeatherConditions,
  swell: SwellConditions
): string[] {
  const factors: string[] = [];

  factors.push(visibility ? `Vis: ${visibility.metres}m (${visibility.rating})` : "Vis: unavailable");

  factors.push(
    `Swell: ${swell.current.height}m @ ${swell.current.period}s from ${swell.current.direction} (${swell.trend})`
  );

  factors.push(
    `Wind: ${weather.observation.windDirection} ${weather.observation.windSpeed}kt`
  );

  factors.push(`Tide: ${weather.tides.currentState.replace(/_/g, " ")}`);

  if (weather.rainfall.last24h >= 5) {
    factors.push(`Rain: ${weather.rainfall.last24h}mm in last 24h`);
  } else {
    factors.push(
      `Rain: ${weather.rainfall.daysSinceSignificantRain}d since significant rain`
    );
  }

  return factors;
}

// Exported for testing only — not part of the public API
export const _testInternals = {
  generateRecommendation,
  generateSummary,
  timeAdvicePhrase,
  forwardLookPhrase,
  shortName,
  siteContextReason,
  visCausePhrase,
  swellWarningPhrase,
};

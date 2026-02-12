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
import { fetchSwellData, type SwellConditions } from "../data/swell";
import {
  fetchSharkActivity,
  type SharkActivitySummary,
} from "../data/sharksmart";
import { northernBeachesSites, type DiveSite } from "../sites/northern-beaches";
import { rankSites, type SiteRanking } from "./site-rank";
import type { VisibilityEstimate } from "./visibility";
import { estimateVisibility } from "./visibility";

// --- Types ---

export interface DataSourceStatus {
  weather: { available: boolean; source: string };
  swell: { available: boolean; source: string };
  shark: { available: boolean; source: string };
}

export interface DiveBriefing {
  generatedAt: string;
  forecastHour: number | null; // null = current conditions, 0-23 = forecast for that AEST hour
  timeOfDay: "dawn" | "morning" | "midday" | "afternoon" | "dusk";
  dataStatus: DataSourceStatus;
  conditions: {
    weather: WeatherConditions | null;
    swell: SwellConditions | null;
    sharkActivity: SharkActivitySummary;
  };
  visibility: VisibilityEstimate | null;
  siteRankings: SiteRanking[];
  recommendation: BriefingRecommendation;
}

export interface BriefingRecommendation {
  go: boolean;
  confidence: "high" | "medium" | "low";
  summary: string;
  bestSite: string;
  bestTimeWindow: string;
  keyFactors: string[];
}

// --- Time of day helper ---

function getTimeOfDay(
  hour?: number
): "dawn" | "morning" | "midday" | "afternoon" | "dusk" {
  const h = hour ?? new Date().getHours();
  if (h < 6) return "dawn";
  if (h < 10) return "morning";
  if (h < 14) return "midday";
  if (h < 17) return "afternoon";
  return "dusk";
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
}): Promise<DiveBriefing> {
  const timeOfDay = getTimeOfDay(options?.hour);
  const sites = options?.sites ?? northernBeachesSites;

  // Fetch all data in parallel
  const [weather, swell, sharkActivity] = await Promise.all([
    fetchWeatherData(),
    fetchSwellData(),
    fetchSharkActivity(),
  ]);

  // Track which data sources are available
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
      available: true,
      source: sharkActivity.source,
    },
  };

  // If a specific hour is requested, override current swell/wind with forecast data
  const forecastHour = options?.hour;
  if (forecastHour !== undefined && swell) {
    const forecastSwell = findForecastForHour(swell.forecast, forecastHour);
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
      const forecastWind = findForecastForHour(swell.windForecast, forecastHour);
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
      windDirection: weather.observation.windDirection,
      windSpeed: weather.observation.windSpeed,
      tides: weather.tides,
      month,
      seaSurfaceTemp: weather.seaSurfaceTemp,
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
    });
  }

  // Generate recommendation
  const recommendation = generateRecommendation(
    siteRankings,
    visibility,
    weather,
    swell,
    timeOfDay
  );

  return {
    generatedAt: new Date().toISOString(),
    forecastHour: forecastHour ?? null,
    timeOfDay,
    dataStatus,
    conditions: {
      weather,
      swell,
      sharkActivity,
    },
    visibility,
    siteRankings,
    recommendation,
  };
}

// --- Forecast hour helper ---

/**
 * Find the forecast entry closest to the given AEST hour (0-23) for today.
 * Willyweather timestamps are in AEST format: "2026-02-12 14:00:00"
 */
function findForecastForHour<T extends { timestamp: string }>(
  entries: T[],
  targetHour: number
): T | null {
  if (entries.length === 0) return null;

  // Build target date in AEST: today at the requested hour
  const now = new Date();
  // Convert to AEST (UTC+11)
  const aestNow = new Date(now.getTime() + 11 * 60 * 60 * 1000);
  const todayStr = aestNow.toISOString().slice(0, 10); // "2026-02-12"
  const targetStr = `${todayStr} ${String(targetHour).padStart(2, "0")}:00:00`;

  // Find closest entry
  let closest = entries[0];
  let closestDiff = Infinity;
  for (const entry of entries) {
    const diff = Math.abs(
      new Date(entry.timestamp.replace(" ", "T") + "+11:00").getTime() -
      new Date(targetStr.replace(" ", "T") + "+11:00").getTime()
    );
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = entry;
    }
  }
  return closest;
}

// --- Recommendation logic ---

function generateRecommendation(
  rankings: SiteRanking[],
  visibility: VisibilityEstimate | null,
  weather: WeatherConditions | null,
  swell: SwellConditions | null,
  timeOfDay: string
): BriefingRecommendation {
  // If critical data is missing, we can't make a recommendation
  if (!weather || !swell) {
    const missing: string[] = [];
    if (!weather) missing.push("weather");
    if (!swell) missing.push("swell");
    return {
      go: false,
      confidence: "low",
      summary: `Cannot assess conditions — ${missing.join(" and ")} data unavailable. Check back later or assess conditions on-site.`,
      bestSite: "Unknown",
      bestTimeWindow: "Unable to determine — insufficient data",
      keyFactors: missing.map((s) => `${s}: data unavailable`),
    };
  }

  const bestSite = rankings[0];
  const bestScore = bestSite?.diveScore.overall ?? 0;

  // Should we go?
  const go = bestScore >= 5;

  // Confidence in the recommendation
  let confidence: BriefingRecommendation["confidence"] = "medium";
  if (visibility?.confidence === "high" && bestScore >= 7) {
    confidence = "high";
  } else if (visibility?.confidence === "low" || bestScore < 4) {
    confidence = "low";
  }

  // Summary
  const summary = generateSummary(bestSite, bestScore, visibility, swell);

  // Best time window
  const bestTimeWindow = suggestBestTime(weather, swell, timeOfDay);

  // Key factors
  const keyFactors = collectKeyFactors(
    bestSite,
    visibility,
    weather,
    swell
  );

  return {
    go,
    confidence,
    summary,
    bestSite: bestSite?.site.name ?? "None available",
    bestTimeWindow,
    keyFactors,
  };
}

function generateSummary(
  bestSite: SiteRanking | undefined,
  bestScore: number,
  visibility: VisibilityEstimate | null,
  swell: SwellConditions
): string {
  if (!bestSite) {
    return "Unable to generate recommendation — no sites available.";
  }

  const visStr = visibility ? `${visibility.metres}m vis` : "vis unknown";

  if (bestScore >= 8) {
    return `Excellent conditions. ${bestSite.site.name} is firing — ${visStr}, ${swell.current.height}m ${swell.trend} swell. Get in the water.`;
  }

  if (bestScore >= 6.5) {
    const ratingStr = visibility ? `${visibility.rating} vis (${visibility.metres}m)` : "vis unknown";
    return `Good conditions at ${bestSite.site.name}. ${ratingStr}, ${swell.current.height}m swell. Worth a dive.`;
  }

  if (bestScore >= 5) {
    const caveat = bestSite.diveScore.concerns.length > 0
      ? ` Watch out for: ${bestSite.diveScore.concerns[0]}.`
      : "";
    return `Fair conditions. ${bestSite.site.name} is your best bet with a ${bestSite.diveScore.overall}/10.${caveat}`;
  }

  if (bestScore >= 3.5) {
    return `Marginal conditions. ${bestSite.site.name} scored ${bestSite.diveScore.overall}/10. Consider waiting for better conditions unless you're keen.`;
  }

  return `Poor conditions across all sites. Best option ${bestSite.site.name} only scored ${bestSite.diveScore.overall}/10. Recommend waiting.`;
}

function suggestBestTime(
  weather: WeatherConditions,
  swell: SwellConditions,
  currentTimeOfDay: string
): string {
  // Rising tide is generally better
  const tideState = weather.tides.currentState;

  if (tideState === "rising") {
    return "Now is good — rising tide bringing clean water in";
  }

  if (weather.tides.nextHigh) {
    const nextHighTime = new Date(weather.tides.nextHigh.time);
    const hoursUntilHigh =
      (nextHighTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilHigh > 0 && hoursUntilHigh <= 4) {
      const timeStr = nextHighTime.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `Aim for the incoming tide — next high at ${timeStr}. Get in 2-3 hours before.`;
    }
  }

  // Swell trend
  if (swell.trend === "dropping") {
    return "Swell is dropping — conditions should improve through the day";
  }
  if (swell.trend === "building") {
    return "Swell is building — go sooner rather than later";
  }

  // Default: morning is usually best
  if (currentTimeOfDay === "dawn" || currentTimeOfDay === "morning") {
    return "Morning session looks good — wind typically picks up in the afternoon";
  }

  return "Early morning tomorrow is likely the best window";
}

function collectKeyFactors(
  bestSite: SiteRanking | undefined,
  visibility: VisibilityEstimate | null,
  weather: WeatherConditions,
  swell: SwellConditions
): string[] {
  const factors: string[] = [];

  // Vis
  factors.push(visibility ? `Vis: ${visibility.metres}m (${visibility.rating})` : "Vis: unavailable");

  // Swell
  factors.push(
    `Swell: ${swell.current.height}m @ ${swell.current.period}s from ${swell.current.direction} (${swell.trend})`
  );

  // Wind
  factors.push(
    `Wind: ${weather.observation.windDirection} ${weather.observation.windSpeed}kt`
  );

  // Tide
  factors.push(`Tide: ${weather.tides.currentState}`);

  // Rain
  if (weather.rainfall.last24h >= 5) {
    factors.push(`Rain: ${weather.rainfall.last24h}mm in last 24h`);
  } else {
    factors.push(
      `Rain: ${weather.rainfall.daysSinceSignificantRain}d since significant rain`
    );
  }

  // Top species at best site
  if (bestSite && bestSite.topSpecies.length > 0) {
    const top = bestSite.topSpecies
      .slice(0, 2)
      .map((s) => `${s.name} (${s.likelihood.score}%)`)
      .join(", ");
    factors.push(`Best chances: ${top}`);
  }

  return factors;
}

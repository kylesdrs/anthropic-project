/**
 * Test the new conversational briefing text across scenarios.
 * Uses the _testInternals export to directly exercise the text generation.
 */

import { northernBeachesSites } from "../src/sites/northern-beaches";
import { rankSites, type SiteRanking } from "../src/engine/site-rank";
import { generate5DayOutlook, type FiveDayOutlook } from "../src/engine/outlook";
import { _testInternals } from "../src/engine/briefing";
import type { WeatherConditions } from "../src/data/bom";
import type { SwellConditions } from "../src/data/swell";
import type { VisibilityEstimate } from "../src/engine/visibility";

const { generateRecommendation, shortName, siteContextReason, visCausePhrase, swellWarningPhrase } = _testInternals;

interface Scenario {
  name: string;
  swell: { height: number; period: number; direction: string; directionDeg: number };
  wind: { speed: number; gust: number; direction: string; directionDeg: number };
  rain: { last24h: number; daysSince: number };
  cloud: string;
  trend: "building" | "holding" | "dropping";
}

const scenarios: Scenario[] = [
  {
    name: "SKIP IT — 1.7m SE swell, rain, onshore",
    swell: { height: 1.7, period: 8, direction: "SE", directionDeg: 135 },
    wind: { speed: 17, gust: 24, direction: "SE", directionDeg: 135 },
    rain: { last24h: 5, daysSince: 1 },
    cloud: "Partly cloudy",
    trend: "building",
  },
  {
    name: "MARGINAL — 1.2m E swell, light onshore, recent rain",
    swell: { height: 1.2, period: 9, direction: "E", directionDeg: 90 },
    wind: { speed: 10, gust: 14, direction: "E", directionDeg: 90 },
    rain: { last24h: 2, daysSince: 2 },
    cloud: "Partly cloudy",
    trend: "holding",
  },
  {
    name: "FAIR — 1.0m S, moderate W wind, bit of rain",
    swell: { height: 1.0, period: 10, direction: "S", directionDeg: 180 },
    wind: { speed: 12, gust: 16, direction: "W", directionDeg: 270 },
    rain: { last24h: 3, daysSince: 1 },
    cloud: "Partly cloudy",
    trend: "holding",
  },
  {
    name: "GOOD — 0.8m S swell, light westerly, dry",
    swell: { height: 0.8, period: 10, direction: "S", directionDeg: 180 },
    wind: { speed: 8, gust: 12, direction: "W", directionDeg: 270 },
    rain: { last24h: 0, daysSince: 5 },
    cloud: "Mostly sunny",
    trend: "dropping",
  },
  {
    name: "EPIC — 0.5m SE, calm westerly, bone dry",
    swell: { height: 0.5, period: 12, direction: "SE", directionDeg: 135 },
    wind: { speed: 5, gust: 8, direction: "W", directionDeg: 270 },
    rain: { last24h: 0, daysSince: 10 },
    cloud: "Clear",
    trend: "dropping",
  },
];

function buildWeather(s: Scenario): WeatherConditions {
  return {
    observation: {
      timestamp: new Date().toISOString(),
      airTemp: 22,
      humidity: 65,
      windSpeed: s.wind.speed,
      windGust: s.wind.gust,
      windDirection: s.wind.direction,
      windDirectionDeg: s.wind.directionDeg,
      pressure: 1015,
      rainfall: s.rain.last24h,
      cloud: s.cloud,
    },
    tides: {
      predictions: [],
      currentState: "mid_falling",
      nextHigh: null,
      nextLow: null,
    },
    rainfall: {
      last24h: s.rain.last24h,
      last48h: s.rain.last24h * 1.5,
      last72h: s.rain.last24h * 2,
      daysSinceSignificantRain: s.rain.daysSince,
    },
    seaSurfaceTemp: 20,
    source: "bom-manly",
    fetchedAt: new Date().toISOString(),
  };
}

function buildSwell(s: Scenario): SwellConditions {
  return {
    current: {
      timestamp: new Date().toISOString(),
      height: s.swell.height,
      period: s.swell.period,
      direction: s.swell.direction,
      directionDeg: s.swell.directionDeg,
    },
    secondary: null,
    trend: s.trend,
    forecast: [],
    windForecast: [],
    weatherForecast: [],
    source: "willyweather",
    fetchedAt: new Date().toISOString(),
  };
}

console.log("=== BRIEFING TEXT TESTS ===\n");
console.log("Testing conversational tone across 5 condition tiers.\n");

for (const s of scenarios) {
  const weather = buildWeather(s);
  const swell = buildSwell(s);

  const rankings = rankSites(northernBeachesSites, {
    weather,
    swell,
    sharkActivity: {
      alerts: [],
      daysSinceLastActivity: null,
      source: "seed",
      fetchedAt: new Date().toISOString(),
    },
    timeOfDay: "morning",
    hasRealSharkData: false,
  });

  const outlook = generate5DayOutlook(swell, null);

  const rec = generateRecommendation(
    rankings,
    null, // general vis — function will use site-specific
    weather,
    swell,
    "morning",
    outlook
  );

  const best = rankings[0];

  console.log(`--- ${s.name} ---`);
  console.log(`Best: ${best.site.name} (${shortName(best.site.name)}) | ${best.diveScore.overall}/10 | Vis: ${best.visibility.metres}m`);
  console.log();
  console.log(`SUMMARY:`);
  console.log(`  "${rec.summary}"`);
  console.log();
  console.log(`TIME:`);
  console.log(`  "${rec.bestTimeWindow}"`);
  console.log();

  // Show helper outputs
  console.log(`HELPERS:`);
  console.log(`  Site context: "${siteContextReason(best)}"`);
  console.log(`  Vis cause: "${visCausePhrase(best, weather, swell)}"`);
  console.log(`  Swell warning: "${swellWarningPhrase(best, swell)}"`);
  console.log();
  console.log("---\n");
}

// Test night time
console.log("--- NIGHT TIME ---");
const nightRec = generateRecommendation([], null, null, null, "night", null);
console.log(`  "${nightRec.summary}"`);
console.log();

// Test no data
console.log("--- NO DATA ---");
const noDataRec = generateRecommendation([], null, null, null, "morning", null);
console.log(`  "${noDataRec.summary}"`);
console.log();

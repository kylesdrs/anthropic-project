/**
 * Test harness: inject real BOM conditions for 10 March 2026 and
 * run the model engines to validate output.
 *
 * BOM Coastal Forecast (7 Mar issue):
 * - Wind: SE 15-20kt, decreasing to ~10kt evening
 * - Seas: SE 1.5-2m, decreasing to 1.5m afternoon
 * - Weather: Partly cloudy, 80% chance of showers
 *
 * Abyss Scuba (9 Mar):
 * - Swell: 1.4m SSE @ 7.7s (yesterday, today is worse)
 * - Vis: 2-5m
 * - Water temp: 20°C
 * - Assessment: "Marginal for shore diving"
 *
 * Expected: today should be "Poor" or "Skip it" — worse than yesterday.
 */

import { estimateVisibility, type VisibilityEstimate } from "../src/engine/visibility";
import { calculateDiveScore } from "../src/engine/dive-score";
import { northernBeachesSites, type DiveSite } from "../src/sites/northern-beaches";
import type { RainfallData, TideData } from "../src/data/bom";

// --- Today's conditions (10 March 2026) ---

const rainfall: RainfallData = {
  last24h: 5,          // Light showers yesterday
  last48h: 8,          // Scattered showers over 2 days
  last72h: 12,         // Some rain over 3 days
  daysSinceSignificantRain: 1, // Recent rain activity
};

const tides: TideData = {
  predictions: [],
  currentState: "mid_falling", // Assume mid-morning falling tide
  nextHigh: null,
  nextLow: null,
};

const swell = {
  timestamp: "2026-03-10T07:00:00+11:00",
  height: 1.7,         // BOM: 1.5-2m, using midpoint
  period: 8,           // Typical for SE windswell
  direction: "SE",
  directionDeg: 135,
};

const windSpeed = 17;    // BOM: SE 15-20kt
const windGust = 24;     // Typical gust factor
const windDirection = "SE";
const airTemp = 22;
const waterTemp = 20;    // Abyss reported 20°C
const cloud = "Partly cloudy"; // BOM: Partly cloudy, 80% chance of showers
const month = 3;         // March

console.log("=== MODEL vs REALITY: 10 March 2026 ===\n");
console.log("Input conditions:");
console.log(`  Swell: ${swell.height}m ${swell.direction} @ ${swell.period}s`);
console.log(`  Wind: ${windDirection} ${windSpeed}kt (gusts ${windGust}kt)`);
console.log(`  Rain: ${rainfall.last24h}mm/24h, ${rainfall.daysSinceSignificantRain}d since significant`);
console.log(`  SST: ${waterTemp}°C`);
console.log(`  Cloud: ${cloud}`);
console.log(`  Tide: ${tides.currentState}`);
console.log();

// --- Run visibility + dive score for each site ---

console.log("=== SITE-BY-SITE COMPARISON ===\n");
console.log("Expected from BOM/Abyss: Vis 1-3m exposed, 3-5m sheltered. All scores < 5/10.\n");

for (const site of northernBeachesSites) {
  const vis = estimateVisibility(
    {
      rainfall,
      swell,
      swellTrend: "holding",
      windDirection,
      windSpeed,
      windGust,
      tides,
      month,
      seaSurfaceTemp: waterTemp,
      cloud,
    },
    site
  );

  const score = calculateDiveScore({
    visibility: vis,
    sharkRisk: null,
    swell,
    windSpeed,
    windGust,
    windDirection,
    airTemp,
    waterTemp,
    site,
    timeOfDay: "morning",
    cloud,
    tideState: tides.currentState,
  });

  // Check site swell threshold
  const swellThreshold = site.swellThresholds?.[swell.direction] ?? site.bestConditions.swellMax;
  const overLimit = swell.height > swellThreshold;

  console.log(`${site.name}`);
  console.log(`  Vis: ${vis.metres}m (${vis.rating}, ${vis.confidence})`);
  console.log(`  Score: ${score.overall}/10 (${score.label})`);
  console.log(`  Breakdown: vis=${score.breakdown.visibility}, fit=${score.breakdown.conditionsFit}, safety=${score.breakdown.safety}, comfort=${score.breakdown.comfort}`);
  console.log(`  Swell limit: ${swellThreshold}m (${overLimit ? "EXCEEDED" : "ok"})`);
  if (score.concerns.length > 0) console.log(`  Concerns: ${score.concerns.join("; ")}`);
  console.log(`  ${vis.explanation}`);

  // Flag discrepancies
  const issues: string[] = [];
  if (score.overall >= 5 && overLimit) issues.push("SCORE TOO HIGH: swell exceeds safe limit but score ≥5");
  if (vis.metres > 5 && site.exposure.includes("SE")) issues.push("VIS TOO OPTIMISTIC: exposed to SE, should be <5m");
  if (score.overall >= 7) issues.push("SCORE UNREALISTIC: BOM says worse than marginal today");

  if (issues.length > 0) {
    console.log(`  ⚠️  DISCREPANCIES: ${issues.join("; ")}`);
  }
  console.log();
}

// --- Test outlook null-data behavior ---
console.log("=== OUTLOOK NULL-DATA TEST ===\n");
import { generate5DayOutlook } from "../src/engine/outlook";
const outlook = generate5DayOutlook(null, null);
if (outlook === null) {
  console.log("✓ Outlook correctly returns null when both data sources unavailable");
} else {
  console.log(`⚠️  BUG: Outlook returned ${outlook.days.length} days with no data`);
  for (const day of outlook.days) {
    console.log(`  ${day.dayName}: ${day.diveScore}/10 (${day.scoreLabel})`);
  }
}

// --- Summary comparison ---
console.log("\n=== COMPARISON SUMMARY ===\n");
console.log("Real BOM assessment: Worse than yesterday's 'Marginal'. Swell 1.5-2m SE, 80% rain.");
console.log("Abyss yesterday: 2-5m vis at sheltered sites, 'Marginal for shore diving'.\n");
console.log("Model should show: All sites Poor/Skip It, vis 1-3m exposed, 3-5m deep/sheltered.\n");

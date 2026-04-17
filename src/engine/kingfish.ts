/**
 * Kingfish (Yellowtail Kingfish — Seriola lalandi) presence likelihood model.
 *
 * Scores 8 scientifically verified factors to produce a 0–100 likelihood
 * score and a rating of Poor / Marginal / Fair / Good / Excellent.
 *
 * Factors (in order of importance):
 *   1. EAC / SST anomaly         — East Australian Current eddy intrusions
 *   2. Water temperature          — 17–24 °C preferred, 21–23 °C optimal
 *   3. Current running            — bait concentration against structure
 *   4. Offshore wind & bait       — W/NW/SW pushes bait against headlands
 *   5. Visibility                 — high vis = EAC inshore = better kings
 *   6. Season & spawn timing      — Oct–Apr peak, Nov–Feb best
 *   7. Time of day                — dawn and dusk prime feeding windows
 *   8. Moon phase (tidal proxy)   — new/full moon = stronger tides = more current
 */

import type { DiveSite } from "../sites/northern-beaches";

// Monthly average SST for Sydney (°C) — long-term BOM/IMOS climatology
const MONTHLY_SST_BASELINE: Record<number, number> = {
  1: 23.0, 2: 23.5, 3: 22.5, 4: 21.5, 5: 20.0, 6: 18.5,
  7: 17.5, 8: 17.5, 9: 18.0, 10: 19.0, 11: 20.5, 12: 22.0,
};

const OFFSHORE_DIRECTIONS = new Set(["W", "WNW", "WSW", "NW", "NNW", "SW", "SSW"]);
const ONSHORE_DIRECTIONS = new Set(["E", "ENE", "ESE", "NE", "NNE", "SE", "SSE"]);

const KINGFISH_STRUCTURE = new Set([
  "headlands", "drop-offs", "bommies", "reef edges", "gutters",
  "rocky reef", "reef drop-offs", "boulder reef", "dramatic walls",
  "reef ledges", "walls", "deep drop-offs", "boulder fields",
]);

// --- Types ---

export interface KingfishInput {
  month: number;
  sst: number | null;
  waterTemp: number;
  estimatedVis: number;
  currentStrength: "none" | "light" | "moderate" | "strong";
  tideState: string;
  windDirection: string;
  windSpeed: number;
  pressure: number;
  timeOfDay: "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk";
  hour: number;
}

export interface KingfishFactorScore {
  name: string;
  score: number;
  detail: string;
}

export interface KingfishResult {
  rawScore: number;
  normalizedScore: number;
  rating: "Poor" | "Marginal" | "Fair" | "Good" | "Excellent";
  factors: KingfishFactorScore[];
  positiveFactors: string[];
  negativeFactors: string[];
  bestTimeWindow: string;
  safetyOverride: boolean;
  safetyWarning: string | null;
}

export interface SiteKingfishResult extends KingfishResult {
  siteId: string;
  siteName: string;
  siteReason: string;
}

export interface KingfishConditions {
  overall: KingfishResult;
  perSite: SiteKingfishResult[];
  bestSite: SiteKingfishResult | null;
}

// --- Factor 1: EAC / SST Anomaly ---

function scoreEAC(sst: number | null, month: number): KingfishFactorScore {
  if (sst === null) {
    return { name: "EAC / SST", score: 0, detail: "SST data unavailable" };
  }

  const baseline = MONTHLY_SST_BASELINE[month] ?? 20;
  const anomaly = sst - baseline;

  if (sst > 24) {
    return { name: "EAC / SST", score: -5, detail: `SST ${sst}°C — too warm, kings move to deeper/cooler water` };
  }
  if (sst >= 22 && anomaly >= 1.5) {
    return { name: "EAC / SST", score: 25, detail: `SST ${sst}°C (+${anomaly.toFixed(1)}°C anomaly) — EAC eddy confirmed inshore` };
  }
  if (sst >= 21 && anomaly >= 0.5) {
    return { name: "EAC / SST", score: 15, detail: `SST ${sst}°C (+${anomaly.toFixed(1)}°C) — EAC influence present` };
  }
  if (sst >= 19 && sst <= 21 && anomaly >= -0.5 && anomaly <= 0.5) {
    return { name: "EAC / SST", score: 0, detail: `SST ${sst}°C — neutral, no strong EAC signal` };
  }
  if (sst < 18 || anomaly < 0) {
    return { name: "EAC / SST", score: -15, detail: `SST ${sst}°C — EAC offshore, kings gone` };
  }

  return { name: "EAC / SST", score: 0, detail: `SST ${sst}°C — neutral` };
}

// --- Factor 2: Water Temperature ---

function scoreWaterTemp(temp: number): KingfishFactorScore {
  if (temp >= 21 && temp <= 23) {
    return { name: "Water Temp", score: 15, detail: `${temp}°C — optimal range (21–23°C)` };
  }
  if ((temp >= 19 && temp < 21) || (temp > 23 && temp <= 24)) {
    return { name: "Water Temp", score: 8, detail: `${temp}°C — good range` };
  }
  if (temp >= 17 && temp < 19) {
    return { name: "Water Temp", score: 0, detail: `${temp}°C — present but less active` };
  }
  if (temp < 17) {
    return { name: "Water Temp", score: -20, detail: `${temp}°C — very unlikely inshore` };
  }
  return { name: "Water Temp", score: -10, detail: `${temp}°C — too warm, gone deeper` };
}

// --- Factor 3: Current Running ---

function scoreCurrent(
  strength: "none" | "light" | "moderate" | "strong",
  tideState: string
): KingfishFactorScore {
  const knotEstimate: Record<string, number> = {
    none: 0.1, light: 0.4, moderate: 1.0, strong: 2.0,
  };
  const knots = knotEstimate[strength] ?? 0.5;
  const isRising = tideState === "early_rising" || tideState === "mid_rising";

  if (knots >= 0.5 && knots <= 1.5) {
    const tideNote = isRising ? " on incoming tide" : "";
    return { name: "Current", score: 20, detail: `~${knots}kt${tideNote} — bait concentrating against structure` };
  }
  if (knots > 1.5 && knots <= 2) {
    return { name: "Current", score: 12, detail: `~${knots}kt — strong but workable` };
  }
  if (knots > 2) {
    return { name: "Current", score: -5, detail: `~${knots}kt — too strong for safe diving` };
  }
  if (knots < 0.3) {
    return { name: "Current", score: -15, detail: "Slack water — bait dispersed, kings absent" };
  }
  return { name: "Current", score: 0, detail: `~${knots}kt — light current` };
}

// --- Factor 4: Offshore Wind & Bait Stacking ---

function scoreWind(
  windDir: string,
  windSpeed: number,
  pressure: number
): KingfishFactorScore {
  const isOffshore = OFFSHORE_DIRECTIONS.has(windDir);
  const isOnshore = ONSHORE_DIRECTIONS.has(windDir);

  // Post-frontal proxy: high/rising pressure + offshore wind
  const likelyPostFrontal = isOffshore && pressure > 1018 && windSpeed >= 5 && windSpeed < 15;

  if (likelyPostFrontal) {
    return { name: "Wind & Bait", score: 25, detail: `Post-frontal ${windDir} ${windSpeed}kt — prime bait-stacking window` };
  }
  if (isOffshore && windSpeed >= 5 && windSpeed <= 20) {
    return { name: "Wind & Bait", score: 20, detail: `Offshore ${windDir} ${windSpeed}kt — bait pushed against structure` };
  }
  if (windSpeed < 5) {
    return { name: "Wind & Bait", score: 5, detail: `Light ${windSpeed}kt — some bait concentration` };
  }
  if (isOnshore && windSpeed >= 15) {
    return { name: "Wind & Bait", score: -15, detail: `Onshore ${windDir} ${windSpeed}kt — bait dispersed` };
  }
  if (isOnshore) {
    return { name: "Wind & Bait", score: -5, detail: `Onshore ${windDir} ${windSpeed}kt — not ideal` };
  }

  return { name: "Wind & Bait", score: 0, detail: `${windDir} ${windSpeed}kt` };
}

// --- Factor 5: Visibility ---

function scoreVisibility(vis: number): KingfishFactorScore {
  if (vis < 2) {
    return { name: "Visibility", score: -25, detail: `${vis}m — kings cannot hunt, dangerous to dive` };
  }
  if (vis < 4) {
    return { name: "Visibility", score: -10, detail: `${vis}m — marginal, kings likely absent` };
  }
  if (vis < 6) {
    return { name: "Visibility", score: 0, detail: `${vis}m — neutral, kings may be present near structure` };
  }
  if (vis <= 10) {
    return { name: "Visibility", score: 8, detail: `${vis}m — good conditions` };
  }
  return { name: "Visibility", score: 15, detail: `${vis}m — EAC conditions, excellent for kings` };
}

// --- Factor 6: Season & Spawn Timing ---

function scoreSeason(month: number): KingfishFactorScore {
  if (month >= 11 || month <= 2) {
    return { name: "Season", score: 15, detail: "Peak season (Nov–Feb) — EAC strongest" };
  }
  if (month === 10 || month === 3 || month === 4) {
    return { name: "Season", score: 10, detail: "Shoulder season — kings still active" };
  }
  if (month === 5) {
    return { name: "Season", score: -5, detail: "Late autumn — kings moving deeper" };
  }
  return { name: "Season", score: -10, detail: "Winter — kings deep and less active inshore" };
}

// --- Factor 7: Time of Day ---

function scoreTimeOfDay(
  timeOfDay: string,
  hour: number
): KingfishFactorScore {
  if (timeOfDay === "night") {
    return { name: "Time of Day", score: 0, detail: "Night — no spearfishing" };
  }
  if (timeOfDay === "dawn") {
    return { name: "Time of Day", score: 20, detail: "Dawn — prime feeding window" };
  }
  if (timeOfDay === "dusk") {
    return { name: "Time of Day", score: 12, detail: "Late afternoon — second feeding window" };
  }
  if (timeOfDay === "morning" && hour <= 9) {
    return { name: "Time of Day", score: 8, detail: "Morning — still active after dawn feed" };
  }
  if (timeOfDay === "afternoon" && hour >= 15) {
    return { name: "Time of Day", score: 12, detail: "Late afternoon — feeding picks up" };
  }
  return { name: "Time of Day", score: -5, detail: "Midday — kings go deeper" };
}

// --- Factor 8: Moon Phase (tidal strength proxy) ---

function scoreMoonPhase(): KingfishFactorScore {
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const synodicPeriod = 29.53058867;
  const daysSinceNewMoon = (Date.now() - knownNewMoon) / (1000 * 60 * 60 * 24);
  const moonDay = Math.round(((daysSinceNewMoon % synodicPeriod) + synodicPeriod) % synodicPeriod);

  if (moonDay <= 2 || moonDay >= 28) {
    return { name: "Moon Phase", score: 8, detail: "New moon — strongest tides, more bait concentration" };
  }
  if (moonDay >= 13 && moonDay <= 16) {
    return { name: "Moon Phase", score: 8, detail: "Full moon — strong tides, bait pushed against structure" };
  }
  if ((moonDay >= 6 && moonDay <= 8) || (moonDay >= 21 && moonDay <= 23)) {
    return { name: "Moon Phase", score: 3, detail: "Quarter moon — moderate tidal movement" };
  }
  return { name: "Moon Phase", score: 0, detail: "Intermediate phase — standard tidal flow" };
}

// --- Normalization & Rating ---

function normalize(rawScore: number): number {
  return Math.max(0, Math.min(100, Math.round(rawScore * 0.55 + 35)));
}

function ratingFromScore(score: number): KingfishResult["rating"] {
  if (score >= 75) return "Excellent";
  if (score >= 55) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Marginal";
  return "Poor";
}

function determineBestTimeWindow(hour: number): string {
  if (hour < 5) return "Dawn — first light around 5:30–6am";
  if (hour < 8) return "You're in the prime window now";
  if (hour < 12) return "Morning bite winding down — last chance before midday lull";
  if (hour < 15) return "Wait for the afternoon feed from 3pm";
  if (hour < 18) return "Afternoon feed starting — get in the water";
  return "Tomorrow at dawn for best chances";
}

// --- Main Calculation ---

export function calculateKingfishScore(input: KingfishInput): KingfishResult {
  if (input.timeOfDay === "night") {
    return {
      rawScore: 0,
      normalizedScore: 0,
      rating: "Poor",
      factors: [],
      positiveFactors: [],
      negativeFactors: ["Night — no spearfishing"],
      bestTimeWindow: "Wait for dawn",
      safetyOverride: false,
      safetyWarning: null,
    };
  }

  const factors: KingfishFactorScore[] = [
    scoreEAC(input.sst, input.month),
    scoreWaterTemp(input.waterTemp),
    scoreCurrent(input.currentStrength, input.tideState),
    scoreWind(input.windDirection, input.windSpeed, input.pressure),
    scoreVisibility(input.estimatedVis),
    scoreSeason(input.month),
    scoreTimeOfDay(input.timeOfDay, input.hour),
    scoreMoonPhase(),
  ];

  const rawScore = factors.reduce((sum, f) => sum + f.score, 0);
  const normalizedScore = normalize(rawScore);
  const rating = ratingFromScore(normalizedScore);

  const sorted = [...factors].sort((a, b) => b.score - a.score);
  const positiveFactors = sorted.filter((f) => f.score > 0).slice(0, 2).map((f) => f.detail);
  const negativeFactors = sorted.filter((f) => f.score < 0).slice(-2).reverse().map((f) => f.detail);

  const safetyOverride = input.estimatedVis < 3;
  const safetyWarning = safetyOverride
    ? "Vis too low to dive safely — 3m minimum for spearfishing. Check back when conditions improve."
    : null;

  return {
    rawScore,
    normalizedScore,
    rating,
    factors,
    positiveFactors,
    negativeFactors,
    bestTimeWindow: determineBestTimeWindow(input.hour),
    safetyOverride,
    safetyWarning,
  };
}

// --- Per-Site Scoring ---

export function calculateSiteKingfishScore(
  input: KingfishInput,
  site: DiveSite,
  siteVis: number
): SiteKingfishResult {
  const siteInput = { ...input, estimatedVis: siteVis };
  const result = calculateKingfishScore(siteInput);

  const hasStructure = site.structure.some((s) =>
    [...KINGFISH_STRUCTURE].some((ks) => s.toLowerCase().includes(ks))
  );
  const isKingfishSite = site.targetSpecies.some((s) =>
    s.toLowerCase().includes("kingfish")
  );

  let siteBonus = 0;
  const reasons: string[] = [];

  if (isKingfishSite && hasStructure) {
    siteBonus += 10;
    const matchedStructure = site.structure
      .filter((s) => [...KINGFISH_STRUCTURE].some((ks) => s.toLowerCase().includes(ks)))
      .slice(0, 2);
    reasons.push(`Known kingfish spot with ${matchedStructure.join(" and ")}`);
  } else if (hasStructure) {
    siteBonus += 5;
    reasons.push("Has structure that holds bait");
  } else {
    reasons.push("Limited kingfish structure");
  }

  const avgDepth = (site.depthRange.min + site.depthRange.max) / 2;
  if (avgDepth >= 10 && avgDepth <= 25) {
    siteBonus += 5;
    reasons.push(`good depth (${site.depthRange.min}–${site.depthRange.max}m)`);
  }

  const adjustedRaw = result.rawScore + siteBonus;
  const adjustedNormalized = normalize(adjustedRaw);

  return {
    ...result,
    rawScore: adjustedRaw,
    normalizedScore: adjustedNormalized,
    rating: ratingFromScore(adjustedNormalized),
    siteId: site.id,
    siteName: site.name,
    siteReason: reasons.join(" — "),
  };
}

// --- Orchestrator ---

export function calculateKingfishConditions(
  input: KingfishInput,
  sites: DiveSite[],
  siteVisMap: Map<string, number>
): KingfishConditions {
  const overall = calculateKingfishScore(input);

  const perSite = sites
    .filter((s) => s.status !== "no-take")
    .map((site) => {
      const siteVis = siteVisMap.get(site.id) ?? input.estimatedVis;
      return calculateSiteKingfishScore(input, site, siteVis);
    })
    .sort((a, b) => b.normalizedScore - a.normalizedScore);

  return {
    overall,
    perSite,
    bestSite: perSite.length > 0 ? perSite[0] : null,
  };
}

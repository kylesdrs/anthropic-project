/**
 * Visibility estimation engine v2.
 *
 * Predicts underwater visibility (metres) from environmental factors,
 * with site-specific baselines, dirty water memory (D-Memory),
 * swell energy calculations, six tidal phases, depth-based wind
 * sensitivity, and confidence scoring.
 *
 * Each site has its own baseline vis, seasonal curve, runoff sensitivity,
 * and wind sensitivity. The estimate explains what's helping and hurting
 * vis at each specific site.
 */

import type { RainfallData, TideData } from "../data/bom";
import type { SwellReading } from "../data/swell";
import { classifySwellType } from "../data/swell";
import type { DiveSite } from "../sites/northern-beaches";

// --- Types ---

export interface VisibilityInput {
  rainfall: RainfallData;
  swell: SwellReading;
  swellTrend?: "building" | "holding" | "dropping";
  windDirection: string;
  windSpeed: number; // knots (sustained)
  windGust: number; // knots (gusts)
  tides: TideData;
  month: number; // 1-12
  seaSurfaceTemp: number | null;
  cloud?: string; // BOM cloud description e.g. "Overcast", "Partly cloudy", "Clear"
}

export interface VisibilityEstimate {
  metres: number; // estimated vis in metres
  confidence: "low" | "medium" | "high";
  rating: "excellent" | "good" | "fair" | "poor" | "terrible";
  factors: VisibilityFactor[];
  /** Human-readable per-site explanation, e.g. "Vis at Freshwater: ~5m (baseline 7m in Feb, -2m rain, ...)" */
  explanation: string;
}

export interface VisibilityFactor {
  name: string;
  impact: number; // positive = helps, negative = hurts
  description: string;
}

// --- Constants ---

const FALLBACK_BASELINE = 6; // metres — typical Northern Beaches calm-day vis
const MIN_VIS = 0.5; // Even in terrible conditions you can see your fins
const MAX_VIS = 15;

// Dirty water memory half-life in days (calm conditions)
const TURBIDITY_HALF_LIFE_DAYS = 2;

// --- Estimation ---

/**
 * Estimate underwater visibility from current conditions.
 * When a site is provided, uses site-specific baselines and sensitivities.
 */
export function estimateVisibility(
  input: VisibilityInput,
  site?: DiveSite
): VisibilityEstimate {
  const factors: VisibilityFactor[] = [];

  // --- 1. Site-specific baseline with seasonal curve ---
  const baseline = calculateBaseline(input.month, site);
  factors.push(baseline.factor);

  // --- 2. Dirty water memory (D-Memory) turbidity ---
  const turbidity = calculateTurbidity(input.rainfall, input.swell, site);
  factors.push(turbidity);

  // --- 3. Swell energy (height² × period), not just height ---
  const swellImpact = calculateSwellEnergy(input.swell, input.swellTrend, site);
  factors.push(swellImpact);

  // --- 4. Six-phase tidal model ---
  const tideImpact = calculateTidePhaseImpact(input.tides);
  factors.push(tideImpact);

  // --- 5. Wind surface mixing (depth-based sensitivity) ---
  const effectiveWind = Math.max(input.windSpeed, (input.windGust ?? 0) * 0.75);
  const windImpact = calculateWindMixing(
    input.windDirection,
    Math.round(effectiveWind),
    site
  );
  factors.push(windImpact);

  // --- 6. SST / EAC influence ---
  const sstImpact = calculateSSTImpact(input.seaSurfaceTemp);
  factors.push(sstImpact);

  // --- 7. Cloud cover (light penetration) ---
  if (input.cloud) {
    const cloudImpact = calculateCloudImpact(input.cloud);
    factors.push(cloudImpact);
  }

  // --- Apply factors with diminishing returns on stacked penalties ---
  // In reality, multiple negative factors don't fully compound — there's
  // a floor to how bad vis can get from stacking. Apply full impact for
  // the first 3m of penalties, then 50% for additional penalties.
  // Positive factors always apply fully (good conditions genuinely help).
  const nonBaselineFactors = factors.filter(f => f.name !== "Baseline");
  const totalPositive = nonBaselineFactors
    .filter(f => f.impact > 0)
    .reduce((sum, f) => sum + f.impact, 0);
  const totalNegativeRaw = nonBaselineFactors
    .filter(f => f.impact < 0)
    .reduce((sum, f) => sum + f.impact, 0); // negative number

  // Diminishing returns: first -3m at full weight, then 35%.
  // Multiple negative factors (rain + swell + wind) are partially correlated
  // (SE wind creates SE swell which creates chop), so stacking them at full
  // weight double-counts the impact. 35% excess rate prevents vis from
  // collapsing to unrealistic lows (sub-1m) in merely bad conditions.
  const FULL_PENALTY_LIMIT = -3;
  let effectiveNegative: number;
  if (totalNegativeRaw >= FULL_PENALTY_LIMIT) {
    // Total penalties are mild (e.g. -2m) — apply fully
    effectiveNegative = totalNegativeRaw;
  } else {
    // Apply first 3m at full weight, rest at 35%
    const excess = totalNegativeRaw - FULL_PENALTY_LIMIT; // negative number
    effectiveNegative = FULL_PENALTY_LIMIT + excess * 0.35;
  }

  let vis = baseline.value + totalPositive + effectiveNegative;

  // Clamp
  vis = Math.max(MIN_VIS, Math.min(MAX_VIS, vis));
  vis = Math.round(vis * 10) / 10;

  // Confidence
  const confidence = determineConfidence(input, factors);

  // Rating
  const rating = visRating(vis);

  // Build per-site explanation string
  const wasDampened = totalNegativeRaw < FULL_PENALTY_LIMIT;
  const explanation = buildExplanation(vis, baseline.value, factors, input.month, site, wasDampened);

  return { metres: vis, confidence, rating, factors, explanation };
}

// --- 1. Baseline with seasonal curve ---

function calculateBaseline(
  month: number,
  site?: DiveSite
): { value: number; factor: VisibilityFactor } {
  if (!site) {
    return {
      value: FALLBACK_BASELINE,
      factor: {
        name: "Baseline",
        impact: 0,
        description: `General Northern Beaches baseline: ${FALLBACK_BASELINE}m`,
      },
    };
  }

  const monthIndex = month - 1; // 0-indexed
  const seasonal = site.seasonalCurve[monthIndex];
  const adjusted = Math.round(site.baselineVis * seasonal * 10) / 10;
  const monthName = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][monthIndex];

  const diff = adjusted - site.baselineVis;
  const seasonNote =
    Math.abs(diff) < 0.1
      ? "average for this month"
      : diff > 0
        ? `better than average in ${monthName}`
        : `worse than average in ${monthName}`;

  return {
    value: adjusted,
    factor: {
      name: "Baseline",
      impact: 0, // baseline is the starting point, not a delta
      description: `${site.name} baseline ${site.baselineVis}m, ${seasonNote} → ${adjusted}m`,
    },
  };
}

// --- 2. Dirty water memory (D-Memory) ---

/**
 * Calculate turbidity from rain history using a decay model.
 *
 * Instead of simple thresholds, this models a running turbidity score that:
 * - Spikes with each rain event (proportional to amount)
 * - Decays with a half-life of ~2 days in calm conditions
 * - Decays SLOWER when swell is re-suspending sediment
 * - Stacks: rain on already-turbid water is worse
 * - Is site-specific via runoffSensitivity
 */
function calculateTurbidity(
  rainfall: RainfallData,
  swell: SwellReading,
  site?: DiveSite
): VisibilityFactor {
  const sensitivity = site?.runoffSensitivity ?? 1.0;

  // Reconstruct approximate turbidity from rainfall bins.
  // We have 24h, 48h, 72h totals and days since significant rain.
  // Model each "layer" of rain with appropriate decay.

  // Rain in last 24h: freshest, minimal decay (0.5 day avg age)
  const rain24h = rainfall.last24h;
  // Rain in 24-48h window: ~1.5 day avg age
  const rain24to48 = Math.max(0, rainfall.last48h - rainfall.last24h);
  // Rain in 48-72h window: ~2.5 day avg age
  const rain48to72 = Math.max(0, rainfall.last72h - rainfall.last48h);

  // Swell slows decay: high swell re-suspends sediment.
  // Effective half-life increases with swell energy.
  const swellEnergy = swell.height * swell.height * swell.period;
  const swellDecayFactor = 1 + Math.min(swellEnergy / 50, 1.5); // up to 2.5x slower decay
  const effectiveHalfLife = TURBIDITY_HALF_LIFE_DAYS * swellDecayFactor;

  // Decay function: amount * 2^(-age/halflife)
  const decay = (amount: number, ageDays: number) =>
    amount * Math.pow(2, -ageDays / effectiveHalfLife);

  // Turbidity contributions from each rain layer
  const turb24h = decay(rain24h, 0.5);
  const turb24to48 = decay(rain24to48, 1.5);
  const turb48to72 = decay(rain48to72, 2.5);

  // Stacking factor: rain on dirty water is worse.
  // If there's been sustained rain, turbidity compounds.
  const totalTurbidity = turb24h + turb24to48 + turb48to72;
  const stackingMultiplier = totalTurbidity > 15 ? 1.3 : totalTurbidity > 8 ? 1.15 : 1.0;

  let rawTurbidity = totalTurbidity * stackingMultiplier * sensitivity;

  // Convert turbidity score to vis impact (metres).
  // Scale: 0 turbidity = no impact, 5 = -1m, 15 = -3m, 30+ = -5m
  let impact: number;
  let description: string;

  if (rawTurbidity < 0.5) {
    // Very dry — bonus for clean water
    const dryDays = rainfall.daysSinceSignificantRain;
    if (dryDays >= 7) {
      impact = 2;
      description = `${dryDays} days dry — water well cleared`;
    } else if (dryDays >= 5) {
      impact = 1.5;
      description = `${dryDays} days since significant rain — water has cleared`;
    } else if (dryDays >= 3) {
      impact = 0.5;
      description = `${dryDays} days since rain — still clearing`;
    } else {
      impact = 0;
      description = "No significant recent rainfall";
    }
  } else {
    // Turbid — penalty scales with turbidity score.
    // 0.15 conversion: 7 turbidity units ≈ -1m, 20 units ≈ -3m, capped at -4.5m.
    // Calibrated against Abyss data: moderate rain (5-10mm 48h) ≈ -1 to -2m vis.
    impact = -Math.min(rawTurbidity * 0.15, 4.5);
    impact = Math.round(impact * 10) / 10;

    // Build descriptive explanation
    const parts: string[] = [];
    if (rain24h >= 1) parts.push(`${rain24h}mm in last 24h`);
    if (rain24to48 >= 1) parts.push(`${rain24to48}mm 24-48h ago`);
    if (rain48to72 >= 1) parts.push(`${rain48to72}mm 48-72h ago`);

    const rainDesc = parts.length > 0 ? parts.join(", ") : "recent rain";
    const siteNote = sensitivity > 1.2
      ? ` — ${site?.name ?? "site"} is near a lagoon/creek, extra runoff impact`
      : sensitivity < 0.6
        ? ` — ${site?.name ?? "site"} is deep/offshore, less affected`
        : "";

    const swellNote = swellDecayFactor > 1.3
      ? ". Swell is slowing the clearing process"
      : "";

    const stackNote = stackingMultiplier > 1
      ? ". Multiple rain events stacking turbidity"
      : "";

    description = `Rain turbidity (${rainDesc})${siteNote}${swellNote}${stackNote}`;
  }

  return { name: "Rain Turbidity", impact, description };
}

// --- 3. Swell energy ---

/**
 * Calculate vis impact from swell energy, not just height.
 * Energy = height² × period. A 1m@12s swell has way more energy
 * than 1m@6s. Factor in site exposure to swell direction.
 */
function calculateSwellEnergy(
  swell: SwellReading,
  trend: VisibilityInput["swellTrend"],
  site?: DiveSite
): VisibilityFactor {
  const { height, period, direction } = swell;
  const energy = height * height * period;
  const swellType = classifySwellType(period);

  // Determine site exposure factor
  let exposureFactor = 1.0;
  let exposureNote = "";
  if (site) {
    const dir = normaliseDirection(direction);
    const protectedDirs = site.bestConditions.swellDirectionProtected;
    const exposedDirs = site.exposure;

    if (isDirectionInList(dir, protectedDirs)) {
      exposureFactor = 0.3; // sheltered — only 30% of swell energy reaches site
      exposureNote = ` — ${site.name} is sheltered from ${direction}`;
    } else if (isDirectionInList(dir, exposedDirs)) {
      exposureFactor = 1.2; // fully exposed, slight extra
      exposureNote = ` — ${site.name} is directly exposed to ${direction}`;
    } else {
      exposureFactor = 0.7; // partial shelter
      exposureNote = ` — ${site.name} is partially sheltered from ${direction}`;
    }
  }

  const effectiveEnergy = energy * exposureFactor;

  // Map effective energy to vis impact.
  // Energy thresholds (height² × period × exposure):
  //   <3  = negligible (calm)
  //   3-8 = minor
  //   8-20 = moderate
  //   20-50 = significant
  //   50+ = severe
  let impact: number;
  let description: string;

  if (effectiveEnergy < 3) {
    impact = 0.5;
    description = `Very calm ${height}m swell at ${period}s${exposureNote}`;
  } else if (effectiveEnergy < 8) {
    impact = -0.5;
    description = `Light ${height}m ${swellType} (${period}s, energy ${Math.round(energy)})${exposureNote}`;
  } else if (effectiveEnergy < 20) {
    impact = -1.5;
    description = `Moderate ${height}m ${swellType} (${period}s, energy ${Math.round(energy)})${exposureNote}`;
  } else if (effectiveEnergy < 50) {
    impact = -2.5;
    description = `Strong ${height}m ${swellType} (${period}s, energy ${Math.round(energy)}) — significant bottom disturbance${exposureNote}`;
  } else {
    impact = -4;
    description = `Heavy ${height}m ${swellType} (${period}s, energy ${Math.round(energy)}) — severe turbidity${exposureNote}`;
  }

  // Trend modifier
  if (trend === "building") {
    impact -= 0.5;
    description += ". Swell building — water already churning";
  } else if (trend === "dropping") {
    impact += 0.5;
    description += ". Swell dropping — conditions improving";
  }

  return { name: "Swell Energy", impact, description };
}

// --- 4. Six-phase tidal model ---

/**
 * Model vis impact from six tidal phases:
 * - low_slack:     worst — sediment settled, about to stir
 * - early_rising:  improving — clean water starting to push in
 * - mid_rising:    good — clean ocean water actively pushing in
 * - high_slack:    best — deepest, calmest, cleanest water
 * - early_falling: still OK — water starting to recede
 * - mid_falling:   deteriorating — dirty water pulling out from lagoons/estuaries
 */
function calculateTidePhaseImpact(tides: TideData): VisibilityFactor {
  let impact: number;
  let description: string;

  switch (tides.currentState) {
    case "low_slack":
      impact = -1.5;
      description = "Low tide slack — shallowest water, sediment about to stir, worst for vis";
      break;
    case "early_rising":
      impact = -0.3;
      description = "Early rising tide — clean water starting to push in, vis improving";
      break;
    case "mid_rising":
      impact = 0.8;
      description = "Mid rising tide — clean ocean water actively pushing inshore, good for vis";
      break;
    case "high_slack":
      impact = 1.0;
      description = "High tide slack — deepest, calmest water, best vis conditions";
      break;
    case "early_falling":
      impact = 0.3;
      description = "Early falling tide — still decent, water starting to recede";
      break;
    case "mid_falling":
      impact = -0.8;
      description = "Mid falling tide — lagoon/estuary outflow pulling dirty water across reefs";
      break;
  }

  return { name: "Tide Phase", impact, description };
}

// --- 5. Wind surface mixing (depth-based) ---

/**
 * In shallow sites (<10m), onshore wind above 15kts causes significant
 * surface mixing and sediment suspension. Deep sites are less affected.
 * Uses site's windSensitivity factor.
 */
function calculateWindMixing(
  direction: string,
  speed: number,
  site?: DiveSite
): VisibilityFactor {
  const sensitivity = site?.windSensitivity ?? 1.0;

  const offshore = ["W", "WSW", "SW", "SSW", "WNW", "NW", "NNW"];
  const onshore = ["E", "ESE", "SE", "SSE", "NE", "ENE"];

  let impact = 0;
  let description: string;

  if (speed < 5) {
    impact = 0.5;
    description = "Very light wind — calm, glassy surface";
  } else if (offshore.includes(direction)) {
    if (speed >= 20) {
      impact = 0.5;
      description = `Strong offshore ${direction} ${speed}kt — surface clean but very windy`;
    } else if (speed >= 10) {
      impact = 1;
      description = `Moderate offshore ${direction} ${speed}kt — flattening surface, helping vis`;
    } else {
      impact = 0.5;
      description = `Light offshore ${direction} ${speed}kt — slightly improving conditions`;
    }
  } else if (onshore.includes(direction)) {
    // Onshore impact scaled by wind sensitivity (depth-based).
    // Calibrated: 10kt onshore ≈ -1m at normal sensitivity,
    // 15kt ≈ -1.5m, 20kt+ ≈ -2.5m. Shallow sites scale up.
    if (speed >= 20) {
      impact = -2.5 * sensitivity;
      description = `Strong onshore ${direction} ${speed}kt — heavy surface mixing`;
    } else if (speed >= 15) {
      impact = -1.5 * sensitivity;
      description = `Moderate-strong onshore ${direction} ${speed}kt — significant surface mixing`;
    } else if (speed >= 10) {
      impact = -1 * sensitivity;
      description = `Moderate onshore ${direction} ${speed}kt — chop and turbidity`;
    } else {
      impact = -0.5 * sensitivity;
      description = `Light onshore ${direction} ${speed}kt — some surface disturbance`;
    }

    if (sensitivity > 1.1) {
      description += ` (shallow site — extra wind-sensitive)`;
    } else if (sensitivity < 0.7) {
      description += ` (deep site — less affected by surface wind)`;
    }
  } else {
    // Cross-shore (N or S)
    if (speed >= 20) {
      impact = -1.2 * sensitivity;
      description = `Strong ${direction} ${speed}kt — cross-shore creating significant chop`;
    } else if (speed >= 10) {
      impact = -0.4 * sensitivity;
      description = `Moderate ${direction} ${speed}kt — some surface disturbance`;
    } else {
      impact = 0;
      description = `Light ${direction} ${speed}kt — minimal vis effect`;
    }
  }

  impact = Math.round(impact * 10) / 10;
  return { name: "Wind", impact, description };
}

// --- 6. SST / EAC ---

function calculateSSTImpact(sst: number | null): VisibilityFactor {
  if (sst === null) {
    return { name: "SST", impact: 0, description: "Sea surface temp unavailable" };
  }

  let impact: number;
  let description: string;

  if (sst >= 23) {
    impact = 1.5;
    description = `Warm SST ${sst}°C — EAC influence likely, clearer blue water`;
  } else if (sst >= 21) {
    impact = 0.5;
    description = `SST ${sst}°C — moderate water clarity`;
  } else if (sst < 18) {
    impact = -0.5;
    description = `Cool SST ${sst}°C — cooler water often carries more plankton`;
  } else {
    impact = 0;
    description = `SST ${sst}°C — neutral`;
  }

  return { name: "SST", impact, description };
}

// --- 7. Cloud cover ---

/**
 * Parse BOM cloud description into an oktas-style 0-8 scale.
 */
export function parseCloudCover(cloud: string): number {
  const lower = cloud.toLowerCase().trim();
  if (!lower || lower === "clear" || lower === "sunny") return 0;
  if (lower === "mostly sunny" || lower === "mostly clear") return 2;
  if (lower === "partly cloudy" || lower === "partly sunny") return 4;
  if (lower === "mostly cloudy") return 6;
  if (lower === "cloudy" || lower === "overcast") return 8;
  if (lower.includes("shower") || lower.includes("rain") || lower.includes("storm")) return 8;
  const num = parseInt(lower);
  if (!isNaN(num) && num >= 0 && num <= 8) return num;
  return 4; // unknown — assume partial
}

function calculateCloudImpact(cloud: string): VisibilityFactor {
  const oktas = parseCloudCover(cloud);

  let impact: number;
  let description: string;

  if (oktas >= 7) {
    impact = -0.5;
    description = `Overcast skies (${cloud}) — reduced light penetration, harder to see underwater`;
  } else if (oktas >= 5) {
    impact = -0.3;
    description = `Mostly cloudy (${cloud}) — less light reaching the water`;
  } else if (oktas <= 2) {
    impact = 0.5;
    description = `Clear skies (${cloud}) — good light penetration underwater`;
  } else {
    impact = 0;
    description = `Partly cloudy (${cloud}) — moderate light conditions`;
  }

  return { name: "Cloud Cover", impact, description };
}

// --- Confidence scoring ---

/**
 * Confidence is based on:
 * - High: stable conditions, good data, factors mostly agree
 * - Medium: partial data or mild conflicting signals
 * - Low: multiple competing factors, hard to predict
 */
function determineConfidence(
  input: VisibilityInput,
  factors: VisibilityFactor[]
): VisibilityEstimate["confidence"] {
  let score = 0;

  // Data quality
  if (input.seaSurfaceTemp !== null) score += 2;
  if (input.rainfall.last24h !== undefined) score += 1;
  if (input.swell.period > 0) score += 1;

  // Factor agreement: count how many factors push in the same direction.
  // If factors conflict heavily, confidence drops.
  const significantFactors = factors.filter(f => f.name !== "Baseline" && Math.abs(f.impact) >= 0.5);
  const positive = significantFactors.filter(f => f.impact > 0).length;
  const negative = significantFactors.filter(f => f.impact < 0).length;
  const total = positive + negative;

  if (total > 0) {
    const agreement = Math.abs(positive - negative) / total;
    if (agreement >= 0.6) score += 2; // factors mostly agree
    else if (agreement >= 0.3) score += 1; // mixed
    // else: competing factors, no bonus
  }

  // Specific conflict scenarios that reduce confidence
  const rainImpact = factors.find(f => f.name === "Rain Turbidity");
  const swellImpact = factors.find(f => f.name === "Swell Energy");
  const tideImpact = factors.find(f => f.name === "Tide Phase");

  // Rain clearing but swell re-suspending = hard to predict
  if (rainImpact && swellImpact &&
      rainImpact.impact < -1 && swellImpact.impact < -1) {
    score -= 1; // double negative = harder to predict exact vis
  }

  // Tide improving but rain hurting = competing
  if (tideImpact && rainImpact &&
      tideImpact.impact > 0.5 && rainImpact.impact < -1) {
    score -= 1;
  }

  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

// --- Explanation builder ---

/**
 * Build a human-readable per-site explanation like:
 * "Vis at Freshwater: ~5m (site baseline 7m in Feb, -2m from Tuesday's rain still clearing,
 *  +1m from rising tide, -1m from 1.1m SE swell hitting exposed reef)"
 */
function buildExplanation(
  finalVis: number,
  baselineVis: number,
  factors: VisibilityFactor[],
  month: number,
  site?: DiveSite,
  wasDampened?: boolean
): string {
  const siteName = site?.name ?? "General";
  const monthName = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][month - 1];

  // Collect significant modifiers (skip baseline, skip negligible impacts)
  const modifiers = factors
    .filter(f => f.name !== "Baseline" && Math.abs(f.impact) >= 0.3)
    .map(f => {
      const sign = f.impact > 0 ? "+" : "";
      return `${sign}${f.impact}m ${f.name.toLowerCase()}`;
    });

  const baseDesc = `site baseline ${baselineVis}m in ${monthName}`;
  const modStr = modifiers.length > 0 ? `, ${modifiers.join(", ")}` : "";
  const dampenNote = wasDampened ? " [penalties dampened — diminishing returns]" : "";

  return `Vis at ${siteName}: ~${finalVis}m (${baseDesc}${modStr})${dampenNote}`;
}

// --- Helpers ---

function visRating(metres: number): VisibilityEstimate["rating"] {
  if (metres >= 8) return "excellent";
  if (metres >= 5) return "good";
  if (metres >= 3) return "fair";
  if (metres >= 1.5) return "poor";
  return "terrible";
}

/**
 * Normalise compass direction to primary 8-point (N, NE, E, SE, S, SW, W, NW).
 */
function normaliseDirection(dir: string): string {
  const map: Record<string, string> = {
    N: "N", NNE: "NE", NE: "NE", ENE: "E",
    E: "E", ESE: "SE", SE: "SE", SSE: "S",
    S: "S", SSW: "SW", SW: "SW", WSW: "W",
    W: "W", WNW: "NW", NW: "NW", NNW: "N",
  };
  return map[dir] ?? dir;
}

function isDirectionInList(dir: string, list: string[]): boolean {
  return list.some((d) => normaliseDirection(d) === dir);
}

/**
 * Get a current strength estimate from swell and tide.
 */
export function estimateCurrentStrength(
  swellHeight: number,
  tideState: TideData["currentState"]
): "none" | "light" | "moderate" | "strong" {
  const flowingStates: TideData["currentState"][] = [
    "early_rising", "mid_rising", "early_falling", "mid_falling",
  ];
  const tideFlow = flowingStates.includes(tideState) ? 1 : 0;
  const swellContribution = swellHeight >= 2 ? 2 : swellHeight >= 1 ? 1 : 0;
  const total = tideFlow + swellContribution;

  if (total >= 3) return "strong";
  if (total >= 2) return "moderate";
  if (total >= 1) return "light";
  return "none";
}

/**
 * Visibility estimation algorithm.
 *
 * Predicts underwater visibility (metres) from environmental factors.
 * Northern Beaches baseline: ~3-5m typical, 8-12m+ on good days,
 * 0.5-2m after heavy rain or big swell.
 *
 * Primary factors (in order of impact):
 * 1. Rain history — runoff and sediment are the #1 vis killer
 * 2. Swell size and type — big swell stirs up the bottom
 * 3. Wind direction — offshore cleans, onshore dirties
 * 4. Tide state — rising tide often brings cleaner water
 * 5. Season — summer EAC pushes warm clear water inshore
 * 6. Site-specific modifiers (estuary proximity, depth, etc.)
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
}

export interface VisibilityEstimate {
  metres: number; // estimated vis in metres
  confidence: "low" | "medium" | "high";
  rating: "excellent" | "good" | "fair" | "poor" | "terrible";
  factors: VisibilityFactor[];
}

export interface VisibilityFactor {
  name: string;
  impact: number; // positive = helps, negative = hurts
  description: string;
}

// --- Constants ---

const BASELINE_VIS = 5; // metres — Northern Beaches median vis
const MIN_VIS = 0.5;
const MAX_VIS = 20;

// --- Estimation ---

/**
 * Estimate underwater visibility from current conditions.
 */
export function estimateVisibility(
  input: VisibilityInput,
  site?: DiveSite
): VisibilityEstimate {
  let vis = BASELINE_VIS;
  const factors: VisibilityFactor[] = [];

  // --- 1. Rainfall impact (biggest factor) ---
  const rainImpact = calculateRainImpact(input.rainfall);
  vis += rainImpact.impact;
  factors.push(rainImpact);

  // --- 2. Swell impact ---
  const swellImpact = calculateSwellImpact(input.swell, input.swellTrend);
  vis += swellImpact.impact;
  factors.push(swellImpact);

  // --- 3. Wind direction (use effective wind: higher of sustained and 75% of gust) ---
  const effectiveWind = Math.max(input.windSpeed, (input.windGust ?? 0) * 0.75);
  const windImpact = calculateWindImpact(
    input.windDirection,
    Math.round(effectiveWind)
  );
  vis += windImpact.impact;
  factors.push(windImpact);

  // --- 4. Tide state ---
  const tideImpact = calculateTideImpact(input.tides);
  vis += tideImpact.impact;
  factors.push(tideImpact);

  // --- 5. Season / SST ---
  const seasonImpact = calculateSeasonImpact(
    input.month,
    input.seaSurfaceTemp
  );
  vis += seasonImpact.impact;
  factors.push(seasonImpact);

  // --- 6. Site-specific modifiers ---
  if (site) {
    const siteImpact = calculateSiteModifier(site, input.rainfall);
    vis += siteImpact.impact;
    factors.push(siteImpact);
  }

  // Clamp
  vis = Math.max(MIN_VIS, Math.min(MAX_VIS, vis));
  vis = Math.round(vis * 10) / 10;

  // Confidence based on data quality
  const confidence = determineConfidence(input);

  // Rating
  const rating = visRating(vis);

  return { metres: vis, confidence, rating, factors };
}

// --- Individual factor calculations ---

function calculateRainImpact(rainfall: RainfallData): VisibilityFactor {
  // Heavy recent rain is the #1 vis killer.
  // Northern Beaches: even 5mm creates noticeable runoff from lagoons.
  // Effects linger 2-3 days. Dry spells of 5+ days are needed for good vis.

  let impact = 0;
  let description: string;

  if (rainfall.last24h >= 20) {
    impact = -4;
    description = `Heavy rain last 24h (${rainfall.last24h}mm) — heavy runoff, vis will be terrible`;
  } else if (rainfall.last24h >= 10) {
    impact = -3;
    description = `Moderate rain last 24h (${rainfall.last24h}mm) — significant sediment runoff`;
  } else if (rainfall.last24h >= 5) {
    impact = -1.5;
    description = `Light rain last 24h (${rainfall.last24h}mm) — some runoff and turbidity`;
  } else if (rainfall.last48h >= 15) {
    impact = -1.5;
    description = `Rain in last 48h (${rainfall.last48h}mm) — residual turbidity`;
  } else if (rainfall.last72h >= 20) {
    impact = -1;
    description = `Rain in last 72h (${rainfall.last72h}mm) — lingering sediment`;
  } else if (rainfall.daysSinceSignificantRain >= 5) {
    impact = 1.5;
    description = `${rainfall.daysSinceSignificantRain} days since significant rain — water has cleared`;
  } else if (rainfall.daysSinceSignificantRain >= 3) {
    impact = 0.5;
    description = `${rainfall.daysSinceSignificantRain} days since rain — still clearing`;
  } else {
    impact = 0;
    description = "Recent rain history — neutral effect";
  }

  return { name: "Rainfall", impact, description };
}

function calculateSwellImpact(
  swell: SwellReading,
  trend?: "building" | "holding" | "dropping"
): VisibilityFactor {
  const { height, period } = swell;
  const swellType = classifySwellType(period);

  let impact = 0;
  let description: string;

  // Any swell stirs the bottom and reduces vis.
  // Wind chop (short period, <8s) is far worse than clean groundswell.
  // Mid-period (8-12s) is in between.
  if (height >= 2.5) {
    impact = swellType === "wind-chop" ? -4.5 : swellType === "mid-period" ? -3.5 : -2.5;
    description = `Large ${height}m ${swellType} — heavy bottom disturbance, vis will be very poor`;
  } else if (height >= 1.5) {
    impact = swellType === "wind-chop" ? -3 : swellType === "mid-period" ? -2 : -1.5;
    description = `${height}m ${swellType} — significant turbidity and stirred bottom`;
  } else if (height >= 1.0) {
    impact = swellType === "wind-chop" ? -2 : swellType === "mid-period" ? -1 : -0.5;
    description =
      swellType === "wind-chop"
        ? `${height}m wind chop (${period}s) — messy surface, poor vis`
        : `${height}m ${swellType} (${period}s) — bottom disturbance`;
  } else if (height >= 0.5) {
    impact = swellType === "wind-chop" ? -0.5 : 0;
    description =
      swellType === "wind-chop"
        ? `Light ${height}m wind chop — some surface disturbance`
        : `Light ${height}m swell — minimal effect`;
  } else {
    impact = 0.5;
    description = `Very small ${height}m swell — calm conditions`;
  }

  // Building swell = conditions deteriorating before height peaks
  if (trend === "building") {
    impact -= 1;
    description += ". Swell building — water already churning up";
  } else if (trend === "dropping") {
    impact += 0.5;
    description += ". Swell dropping — conditions improving";
  }

  return { name: "Swell", impact, description };
}

function calculateWindImpact(
  direction: string,
  speed: number
): VisibilityFactor {
  // Offshore wind (W/NW/SW/SSW) flattens the surface and pushes dirty water out.
  // Onshore (E/NE/SE/SSE) pushes turbid water inshore and creates chop.
  // Any wind over ~15kt starts degrading conditions regardless of direction.
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
    if (speed >= 20) {
      impact = -3;
      description = `Strong onshore ${direction} ${speed}kt — heavy chop, pushing dirty water inshore`;
    } else if (speed >= 10) {
      impact = -1.5;
      description = `Moderate onshore ${direction} ${speed}kt — chop and turbidity, vis reduced`;
    } else {
      impact = -0.5;
      description = `Light onshore ${direction} ${speed}kt — some surface disturbance`;
    }
  } else {
    // N or S — cross shore, still creates chop at higher speeds
    if (speed >= 20) {
      impact = -1.5;
      description = `Strong ${direction} ${speed}kt — cross-shore creating significant chop`;
    } else if (speed >= 10) {
      impact = -0.5;
      description = `Moderate ${direction} ${speed}kt — some surface disturbance`;
    } else {
      impact = 0;
      description = `Light ${direction} ${speed}kt — minimal vis effect`;
    }
  }

  return { name: "Wind", impact, description };
}

function calculateTideImpact(tides: TideData): VisibilityFactor {
  // Rising tide brings cleaner ocean water inshore (modest help).
  // Falling tide pulls dirty lagoon/estuary water out through reefs.
  // Low tide = shallower water = swell stirs bottom more = worse vis.
  let impact = 0;
  let description: string;

  switch (tides.currentState) {
    case "rising":
      impact = 0.5;
      description = "Rising tide — cleaner ocean water pushing inshore";
      break;
    case "high_slack":
      impact = 0.5;
      description = "High tide slack — deeper water, less bottom disturbance";
      break;
    case "falling":
      impact = -0.5;
      description =
        "Falling tide — lagoon/estuary outflow brings dirty water";
      break;
    case "low_slack":
      impact = -1;
      description = "Low tide — shallow water means swell stirs bottom more";
      break;
  }

  return { name: "Tide", impact, description };
}

function calculateSeasonImpact(
  month: number,
  sst: number | null
): VisibilityFactor {
  // Summer (Dec-Mar): EAC sometimes pushes warm clear water south
  // Winter (Jun-Aug): Cooler, often clearer after calm spells
  // Autumn (Apr-May): Transitional, can be excellent
  // Spring (Sep-Nov): Often poorest — plankton blooms, variable
  //
  // SST is the best indicator: warm blue EAC water (23°C+) = clear,
  // but only bumps vis modestly — other factors dominate.

  let impact = 0;
  let description: string;

  if (sst !== null && sst >= 23) {
    impact = 1.5;
    description = `Warm SST ${sst}°C — EAC influence likely, clearer blue water`;
  } else if (sst !== null && sst >= 21) {
    impact = 0.5;
    description = `SST ${sst}°C — moderate water clarity`;
  } else if (sst !== null && sst < 18) {
    impact = -0.5;
    description = `Cool SST ${sst}°C — cooler water often carries more plankton`;
  } else if ([12, 1, 2, 3].includes(month)) {
    impact = 0.5;
    description = "Summer — slightly better vis when EAC pushes in";
  } else if ([4, 5].includes(month)) {
    impact = 1;
    description = "Autumn — often the best vis of the year";
  } else if ([6, 7, 8].includes(month)) {
    impact = 0;
    description = "Winter — variable vis, can be excellent on calm days";
  } else {
    // Spring (Sep-Nov)
    impact = -1;
    description = "Spring — plankton blooms common, vis unpredictable";
  }

  return { name: "Season", impact, description };
}

function calculateSiteModifier(
  site: DiveSite,
  rainfall: RainfallData
): VisibilityFactor {
  let impact = 0;
  let description: string;

  // Sites near lagoons/estuaries are more affected by rain
  const nearEstuary =
    site.id === "dee-why-head" || // Dee Why Lagoon
    site.id === "narrabeen-head"; // Narrabeen Lagoon

  if (nearEstuary && rainfall.last48h >= 10) {
    impact = -1.5;
    description = `${site.name} is near a lagoon — rain runoff has extra vis impact here`;
  } else if (nearEstuary && rainfall.last48h >= 5) {
    impact = -0.5;
    description = `${site.name} near lagoon — some extra turbidity from runoff`;
  } else if (site.id === "north-head") {
    // North Head is deeper and more exposed to clean ocean water
    impact = 1;
    description = "North Head — deeper water often means better vis";
  } else if (site.id === "long-reef") {
    // Long Reef shallow platform — vis varies a lot
    impact = -0.5;
    description =
      "Long Reef — shallow platform means vis is more variable";
  } else {
    impact = 0;
    description = `${site.name} — no significant site-specific modifier`;
  }

  return { name: "Site", impact, description };
}

// --- Helpers ---

function determineConfidence(input: VisibilityInput): VisibilityEstimate["confidence"] {
  // Higher confidence when we have SST data and recent observations
  if (input.seaSurfaceTemp !== null && input.rainfall.last24h !== undefined) {
    return "high";
  }
  if (input.seaSurfaceTemp !== null || input.rainfall.last24h !== undefined) {
    return "medium";
  }
  return "low";
}

function visRating(metres: number): VisibilityEstimate["rating"] {
  if (metres >= 10) return "excellent";
  if (metres >= 5) return "good";
  if (metres >= 3) return "fair";
  if (metres >= 1.5) return "poor";
  return "terrible";
}

/**
 * Get a current strength estimate from swell and tide.
 * Bigger swell + tidal movement = stronger current.
 */
export function estimateCurrentStrength(
  swellHeight: number,
  tideState: TideData["currentState"]
): "none" | "light" | "moderate" | "strong" {
  const tideFlow =
    tideState === "rising" || tideState === "falling" ? 1 : 0;
  const swellContribution = swellHeight >= 2 ? 2 : swellHeight >= 1 ? 1 : 0;
  const total = tideFlow + swellContribution;

  if (total >= 3) return "strong";
  if (total >= 2) return "moderate";
  if (total >= 1) return "light";
  return "none";
}

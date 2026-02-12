/**
 * Visibility estimation algorithm.
 *
 * Predicts underwater visibility (metres) from environmental factors.
 * Northern Beaches baseline: ~5-8m typical, 10-15m+ on good days,
 * 1-3m after heavy rain or big swell.
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
  windSpeed: number; // knots
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

const BASELINE_VIS = 6; // metres — Northern Beaches realistic average
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

  // --- 3. Wind direction ---
  const windImpact = calculateWindImpact(
    input.windDirection,
    input.windSpeed
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
  // Heavy recent rain is the #1 vis killer
  // 10mm+ in 24h = significant impact
  // Effects linger 2-3 days

  let impact = 0;
  let description: string;

  if (rainfall.last24h >= 20) {
    impact = -5;
    description = `Heavy rain last 24h (${rainfall.last24h}mm) — runoff will heavily reduce vis`;
  } else if (rainfall.last24h >= 10) {
    impact = -3.5;
    description = `Moderate rain last 24h (${rainfall.last24h}mm) — significant runoff`;
  } else if (rainfall.last24h >= 5) {
    impact = -2;
    description = `Light rain last 24h (${rainfall.last24h}mm) — some runoff`;
  } else if (rainfall.last48h >= 15) {
    impact = -2;
    description = `Rain in last 48h (${rainfall.last48h}mm) — residual turbidity`;
  } else if (rainfall.last72h >= 20) {
    impact = -1;
    description = `Rain in last 72h (${rainfall.last72h}mm) — some lingering effect`;
  } else if (rainfall.daysSinceSignificantRain >= 5) {
    impact = 2;
    description = `${rainfall.daysSinceSignificantRain} days since significant rain — water has had time to clear`;
  } else if (rainfall.daysSinceSignificantRain >= 3) {
    impact = 1;
    description = `${rainfall.daysSinceSignificantRain} days since rain — clearing`;
  } else {
    impact = 0;
    description = "Moderate rain history — neutral effect";
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

  // Wind chop is much worse for vis than clean groundswell at same height
  if (height >= 2.5) {
    impact = swellType === "wind-chop" ? -5 : -3;
    description = `Large ${height}m ${swellType} — heavy bottom disturbance, vis will be poor`;
  } else if (height >= 1.5) {
    impact = swellType === "wind-chop" ? -3.5 : -1.5;
    description = `${height}m ${swellType} — significant turbidity`;
  } else if (height >= 1.0) {
    impact = swellType === "wind-chop" ? -2 : -0.5;
    description =
      swellType === "wind-chop"
        ? `${height}m wind chop (${period}s) — messy surface, reduced vis`
        : `${height}m ${swellType} — some disturbance`;
  } else if (height >= 0.5) {
    impact = swellType === "wind-chop" ? -0.5 : 0.5;
    description =
      swellType === "wind-chop"
        ? `Light ${height}m wind chop — slight surface disturbance`
        : `Light ${height}m swell — good conditions`;
  } else {
    impact = 1;
    description = `Small ${height}m swell — minimal disturbance`;
  }

  // Building swell means conditions are deteriorating even before height peaks
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
  // Offshore wind (W/NW/SW/SSW) flattens the surface and pushes water out.
  // Onshore (E/NE/SE/SSE) pushes turbid water inshore and creates chop.
  const offshore = ["W", "WSW", "SW", "SSW", "WNW", "NW", "NNW"];
  const onshore = ["E", "ESE", "SE", "SSE", "NE", "ENE"];

  let impact = 0;
  let description: string;

  if (speed < 5) {
    impact = 0.5;
    description = "Very light wind — calm surface conditions";
  } else if (offshore.includes(direction)) {
    if (speed >= 20) {
      impact = 1;
      description = `Strong offshore ${direction} ${speed}kt — cleaning surface but strong wind creates some chop`;
    } else if (speed >= 10) {
      impact = 1.5;
      description = `Moderate offshore ${direction} ${speed}kt — flattening surface, improving vis`;
    } else {
      impact = 1;
      description = `Light offshore ${direction} ${speed}kt — slightly improving conditions`;
    }
  } else if (onshore.includes(direction)) {
    if (speed >= 20) {
      impact = -3;
      description = `Strong onshore ${direction} ${speed}kt — heavy chop, pushing dirty water inshore`;
    } else if (speed >= 10) {
      impact = -1.5;
      description = `Moderate onshore ${direction} ${speed}kt — surface chop and turbidity`;
    } else {
      impact = -0.5;
      description = `Light onshore ${direction} ${speed}kt — slight surface disturbance`;
    }
  } else {
    // N or S — cross shore, still creates chop at higher speeds
    if (speed >= 20) {
      impact = -1.5;
      description = `Strong ${direction} ${speed}kt — cross-shore but creating significant chop`;
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
  // Rising tide generally brings cleaner ocean water inshore
  // Falling tide pulls dirty lagoon/estuary water out through reefs
  let impact = 0;
  let description: string;

  switch (tides.currentState) {
    case "rising":
      impact = 1;
      description = "Rising tide — cleaner ocean water pushing inshore";
      break;
    case "high_slack":
      impact = 0.5;
      description = "High tide slack — water has settled, reasonable vis";
      break;
    case "falling":
      impact = -0.5;
      description =
        "Falling tide — estuary/lagoon outflow can bring dirty water";
      break;
    case "low_slack":
      impact = -0.5;
      description = "Low tide slack — shallower water, more disturbance";
      break;
  }

  return { name: "Tide", impact, description };
}

function calculateSeasonImpact(
  month: number,
  sst: number | null
): VisibilityFactor {
  // Summer (Dec-Mar): EAC pushes warm clear water south
  // Winter (Jun-Aug): Cooler, often clearer after calm spells
  // Autumn (Apr-May): Transitional, can be excellent
  // Spring (Sep-Nov): Often poorest — plankton blooms, variable

  let impact = 0;
  let description: string;

  // Check if EAC influence is present (warm water = clear blue water)
  if (sst !== null && sst >= 23) {
    impact = 2;
    description = `Warm SST ${sst}°C suggests EAC influence — likely blue, clear water`;
  } else if (sst !== null && sst >= 21) {
    impact = 1;
    description = `Warm SST ${sst}°C — reasonable clarity`;
  } else if ([12, 1, 2, 3].includes(month)) {
    impact = 1;
    description = "Summer — typically better vis with EAC influence";
  } else if ([4, 5].includes(month)) {
    impact = 1.5;
    description =
      "Autumn — often the best vis of the year, warm water lingers";
  } else if ([6, 7, 8].includes(month)) {
    impact = 0;
    description =
      "Winter — variable vis, can be excellent on calm days";
  } else {
    // Spring (Sep-Nov)
    impact = -1;
    description =
      "Spring — plankton blooms common, vis can be unpredictable";
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
  if (metres >= 6) return "good";
  if (metres >= 4) return "fair";
  if (metres >= 2) return "poor";
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

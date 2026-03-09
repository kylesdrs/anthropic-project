/**
 * Overall dive score calculator.
 *
 * Produces a 1-10 score combining visibility, conditions fit,
 * safety, and comfort modifiers.
 *
 * Score breakdown:
 * - Visibility:      40% — can you see fish?
 * - Conditions fit:  25% — swell/wind/tide alignment with site
 * - Safety:          25% — shark risk, swell, conditions
 * - Comfort:         10% — wind, temp, entry difficulty
 */

import type { VisibilityEstimate } from "./visibility";
import { parseCloudCover } from "./visibility";
import type { SharkRiskAssessment } from "./shark-risk";
import type { SwellReading } from "../data/swell";
import type { DiveSite } from "../sites/northern-beaches";

// --- Types ---

export interface DiveScoreInput {
  visibility: VisibilityEstimate;
  sharkRisk: SharkRiskAssessment | null;
  swell: SwellReading;
  windSpeed: number; // knots (sustained)
  windGust: number; // knots (gusts)
  windDirection: string;
  airTemp: number;
  waterTemp: number | null;
  site: DiveSite;
  timeOfDay: "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk";
  cloud?: string; // BOM cloud description e.g. "Overcast", "Partly cloudy"
  tideState?: string; // e.g. "early_rising", "high_slack"
}

export interface DiveScore {
  overall: number; // 1-10
  label: string; // "Epic", "Great", "Good", "Fair", "Marginal", "Poor", "Skip It"
  breakdown: {
    visibility: number; // 1-10
    conditionsFit: number; // 1-10
    safety: number; // 1-10
    comfort: number; // 1-10
  };
  topReasons: string[];
  concerns: string[];
}

// --- Scoring ---

/**
 * Calculate overall dive score (1-10).
 */
export function calculateDiveScore(input: DiveScoreInput): DiveScore {
  // Night check — can't dive if you can't see. Hard stop.
  if (input.timeOfDay === "night") {
    return {
      overall: 1,
      label: "Skip It",
      breakdown: {
        visibility: 1,
        conditionsFit: 1,
        safety: 1,
        comfort: 1,
      },
      topReasons: [],
      concerns: ["Too dark to dive — no natural light"],
    };
  }

  const visScore = scoreVisibility(input.visibility);
  const fitScore = scoreConditionsFit(input.swell, input.windSpeed, input.windDirection, input.site, input.tideState);
  const safetyScore = scoreSafety(input.sharkRisk, input.swell, input.site, input.windGust);
  const comfortScore = scoreComfort(
    input.windSpeed,
    input.windGust,
    input.windDirection,
    input.airTemp,
    input.waterTemp,
    input.site
  );

  // Weighted average
  let overall =
    visScore * 0.4 +
    fitScore * 0.25 +
    safetyScore * 0.25 +
    comfortScore * 0.1;

  // Sunlight penalty — dawn and dusk have reduced light
  if (input.timeOfDay === "dusk") {
    overall -= 1.5; // fading light, worse for spearfishing
  } else if (input.timeOfDay === "dawn") {
    overall -= 0.5; // low light, building
  }

  // Cloud cover penalty — overcast skies reduce underwater light
  if (input.cloud) {
    const oktas = parseCloudCover(input.cloud);
    if (oktas >= 7) {
      overall -= 0.8; // heavy overcast — significantly less light underwater
    } else if (oktas >= 5) {
      overall -= 0.3; // mostly cloudy — noticeable reduction
    }
  }

  // Vis-based cap: you can't have a good dive if you can't see.
  // Terrible vis (<1.5m) caps the score at 6 — no point being in the water.
  // Poor vis (<3m) caps at 7.5 — might get lucky on reef fish but pelagics are off.
  const visRating = input.visibility.rating;
  if (visRating === "terrible") {
    overall = Math.min(overall, 6);
  } else if (visRating === "poor") {
    overall = Math.min(overall, 7.5);
  }

  // Round to 1 decimal
  const rounded = Math.round(overall * 10) / 10;
  const clamped = Math.max(1, Math.min(10, rounded));

  const label = scoreLabel(clamped);
  const topReasons = collectReasons(input);
  const concerns = collectConcerns(input);

  return {
    overall: clamped,
    label,
    breakdown: {
      visibility: Math.round(visScore * 10) / 10,
      conditionsFit: Math.round(fitScore * 10) / 10,
      safety: Math.round(safetyScore * 10) / 10,
      comfort: Math.round(comfortScore * 10) / 10,
    },
    topReasons,
    concerns,
  };
}

// --- Component scores ---

function scoreVisibility(vis: VisibilityEstimate): number {
  // Map vis metres to 1-10 score, calibrated for spearfishing.
  // You need to see the fish to shoot them — sub-8m is hard work,
  // sub-5m is basically not worth the dive for pelagics.
  const m = vis.metres;
  if (m >= 15) return 10;
  if (m >= 12) return 9;
  if (m >= 10) return 8;
  if (m >= 8) return 7;
  if (m >= 6) return 5;
  if (m >= 5) return 4;
  if (m >= 4) return 3;
  if (m >= 3) return 2.5;
  if (m >= 2) return 2;
  if (m >= 1) return 1.5;
  return 1;
}

const OFFSHORE_DIRS = new Set(["W", "WSW", "SW", "WNW", "NW", "NNW"]);

function scoreConditionsFit(
  swell: SwellReading,
  windSpeed: number,
  windDirection: string,
  site: DiveSite,
  tideState?: string,
): number {
  let score = 5; // neutral start

  // Swell within site limits
  const swellRatio = swell.height / site.bestConditions.swellMax;
  if (swellRatio <= 0.5) score += 2;       // well under
  else if (swellRatio <= 0.8) score += 1;  // comfortably under
  else if (swellRatio <= 1.0) score += 0;  // at limit
  else if (swellRatio <= 1.3) score -= 1.5;
  else score -= 3;

  // Swell direction protected
  if (site.bestConditions.swellDirectionProtected.includes(swell.direction)) {
    score += 1.5;
  }

  // Wind direction
  if (site.bestConditions.windDirectionIdeal.includes(windDirection)) {
    score += 1.5;
  } else if (OFFSHORE_DIRS.has(windDirection)) {
    score += 0.5; // offshore but not ideal for this specific site
  } else if (windSpeed >= 12) {
    score -= 1; // onshore and strong
  }

  // Wind speed
  if (windSpeed < 8) score += 0.5;
  else if (windSpeed >= 20) score -= 1.5;

  // Tide preference match
  if (tideState) {
    const isRising = tideState === "early_rising" || tideState === "mid_rising";
    const isHighOrRising = isRising || tideState === "high_slack";
    const tideGood =
      site.bestConditions.tidePreference === "any" ||
      (site.bestConditions.tidePreference === "rising" && isRising) ||
      (site.bestConditions.tidePreference === "high" && isHighOrRising);
    if (tideGood) score += 1;
    else score -= 0.5;
  }

  return Math.max(1, Math.min(10, score));
}

function scoreSafety(
  sharkRisk: SharkRiskAssessment | null,
  swell: SwellReading,
  site: DiveSite,
  windGust: number = 0
): number {
  let score = 10;

  // Shark risk penalty (only when real data is available)
  if (sharkRisk) {
    switch (sharkRisk.level) {
      case "high":
        score -= 5;
        break;
      case "elevated":
        score -= 3;
        break;
      case "moderate":
        score -= 1;
        break;
      case "low":
        break;
    }
  }

  // Swell penalty (relative to site max)
  const swellRatio = swell.height / site.bestConditions.swellMax;
  if (swellRatio > 1.5) {
    score -= 4; // way over the site's limit
  } else if (swellRatio > 1.2) {
    score -= 2.5; // borderline
  } else if (swellRatio > 1.0) {
    score -= 1; // slightly over
  }

  // Swell direction — is the site protected?
  const swellDir = swell.direction;
  const protectedDirs = site.bestConditions.swellDirectionProtected;
  if (protectedDirs.length > 0 && !protectedDirs.includes(swellDir)) {
    // Site is exposed to this swell direction
    if (swell.height >= 1.5) {
      score -= 2;
    } else if (swell.height >= 1.0) {
      score -= 1;
    }
  }

  // Wind gust penalty — strong gusts make diving unsafe
  if (windGust >= 25) {
    score -= 3;
  } else if (windGust >= 18) {
    score -= 1.5;
  } else if (windGust >= 12) {
    score -= 0.5;
  }

  return Math.max(1, score);
}

function scoreComfort(
  windSpeed: number,
  windGust: number,
  windDirection: string,
  airTemp: number,
  waterTemp: number | null,
  site: DiveSite
): number {
  let score = 7; // neutral start

  // Wind comfort — use the worse of sustained and gust
  const effectiveWind = Math.max(windSpeed, windGust * 0.8);
  if (effectiveWind >= 25) {
    score -= 4;
  } else if (effectiveWind >= 18) {
    score -= 3;
  } else if (effectiveWind >= 12) {
    score -= 1.5;
  } else if (effectiveWind >= 8) {
    score -= 0.5;
  } else if (effectiveWind < 5) {
    score += 1; // glass off
  }

  // Wind direction match for site
  if (site.bestConditions.windDirectionIdeal.includes(windDirection)) {
    score += 1;
  }

  // Air temperature
  if (airTemp < 15) {
    score -= 1.5;
  } else if (airTemp < 18) {
    score -= 0.5;
  } else if (airTemp >= 22 && airTemp <= 30) {
    score += 0.5;
  }

  // Water temperature
  if (waterTemp !== null) {
    if (waterTemp < 16) {
      score -= 2;
    } else if (waterTemp < 18) {
      score -= 1;
    } else if (waterTemp >= 21 && waterTemp <= 26) {
      score += 1;
    }
  }

  return Math.max(1, Math.min(10, score));
}

// --- Helpers ---

function scoreLabel(score: number): string {
  if (score >= 9) return "Epic";
  if (score >= 8) return "Great";
  if (score >= 7) return "Good";
  if (score >= 5.5) return "Fair";
  if (score >= 4) return "Marginal";
  if (score >= 2.5) return "Poor";
  return "Skip It";
}

function collectReasons(input: DiveScoreInput): string[] {
  const reasons: string[] = [];

  // Sunlight — only claim good daylight if it's actually sunny
  const cloudOktas = input.cloud ? parseCloudCover(input.cloud) : 0;
  if (
    (input.timeOfDay === "midday" || input.timeOfDay === "morning") &&
    cloudOktas < 6
  ) {
    reasons.push("Good daylight");
  }

  // Visibility
  if (input.visibility.metres >= 12) {
    reasons.push(`Excellent vis (${input.visibility.metres}m)`);
  } else if (input.visibility.metres >= 8) {
    reasons.push(`Good vis (${input.visibility.metres}m)`);
  }

  // Wind
  if (
    input.windSpeed < 10 &&
    input.site.bestConditions.windDirectionIdeal.includes(input.windDirection)
  ) {
    reasons.push(`Light offshore ${input.windDirection}`);
  }

  return reasons.slice(0, 3);
}

function collectConcerns(input: DiveScoreInput): string[] {
  const concerns: string[] = [];

  // Sunlight concerns
  if (input.timeOfDay === "dusk") {
    concerns.push("Fading light — reduced visibility and harder to spot fish");
  } else if (input.timeOfDay === "dawn") {
    concerns.push("Low light — still building to usable daylight");
  }

  // Cloud cover concerns
  const concernCloudOktas = input.cloud ? parseCloudCover(input.cloud) : 0;
  if (concernCloudOktas >= 7) {
    concerns.push(`Overcast (${input.cloud}) — poor light for spotting fish`);
  }

  if (input.visibility.metres < 3) {
    concerns.push(`Terrible vis (${input.visibility.metres}m) — can't see fish`);
  } else if (input.visibility.metres < 6) {
    concerns.push(`Poor vis (${input.visibility.metres}m) — hard to spear in this`);
  }

  if (
    input.sharkRisk &&
    (input.sharkRisk.level === "elevated" ||
    input.sharkRisk.level === "high")
  ) {
    concerns.push(`${input.sharkRisk.level} shark risk`);
  }

  if (input.swell.height > input.site.bestConditions.swellMax) {
    concerns.push(
      `Swell ${input.swell.height}m exceeds site max ${input.site.bestConditions.swellMax}m`
    );
  }

  if (input.windGust >= 18) {
    concerns.push(`Strong gusts ${input.windGust}kt`);
  } else if (input.windSpeed >= 18) {
    concerns.push(`Strong wind ${input.windSpeed}kt`);
  }

  return concerns.slice(0, 3);
}

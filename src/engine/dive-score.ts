/**
 * Overall dive score calculator.
 *
 * Produces a 1-10 score combining visibility, fish activity,
 * safety, and comfort modifiers.
 *
 * Score breakdown:
 * - Visibility:     30% — can you see fish?
 * - Fish activity:  30% — are fish likely?
 * - Safety:         25% — shark risk, swell, conditions
 * - Comfort:        15% — wind, temp, entry difficulty
 */

import type { VisibilityEstimate } from "./visibility";
import type { SharkRiskAssessment } from "./shark-risk";
import type { SpeciesLikelihood } from "./species";
import type { SwellReading } from "../data/swell";
import type { DiveSite } from "../sites/northern-beaches";

// --- Types ---

export interface DiveScoreInput {
  visibility: VisibilityEstimate;
  sharkRisk: SharkRiskAssessment | null;
  speciesScores: { speciesName: string; likelihood: SpeciesLikelihood }[];
  swell: SwellReading;
  windSpeed: number; // knots (sustained)
  windGust: number; // knots (gusts)
  windDirection: string;
  airTemp: number;
  waterTemp: number | null;
  site: DiveSite;
  timeOfDay: "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk";
}

export interface DiveScore {
  overall: number; // 1-10
  label: string; // "Epic", "Great", "Good", "Fair", "Marginal", "Poor", "Skip It"
  breakdown: {
    visibility: number; // 1-10
    fishActivity: number; // 1-10
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
        fishActivity: 1,
        safety: 1,
        comfort: 1,
      },
      topReasons: [],
      concerns: ["Too dark to dive — no natural light"],
    };
  }

  const visScore = scoreVisibility(input.visibility);
  const fishScore = scoreFishActivity(input.speciesScores);
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
    visScore * 0.3 +
    fishScore * 0.3 +
    safetyScore * 0.25 +
    comfortScore * 0.15;

  // Sunlight penalty — dawn and dusk have reduced light
  if (input.timeOfDay === "dusk") {
    overall -= 1.5; // fading light, worse for spearfishing
  } else if (input.timeOfDay === "dawn") {
    overall -= 0.5; // low light, building
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
      fishActivity: Math.round(fishScore * 10) / 10,
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

function scoreFishActivity(
  speciesScores: DiveScoreInput["speciesScores"]
): number {
  if (speciesScores.length === 0) return 5; // neutral

  // Take the top 3 species scores and average
  const sorted = [...speciesScores].sort(
    (a, b) => b.likelihood.score - a.likelihood.score
  );
  const top3 = sorted.slice(0, 3);
  const avgScore =
    top3.reduce((sum, s) => sum + s.likelihood.score, 0) / top3.length;

  // Map 0-100 species score to 1-10 dive score
  return Math.max(1, Math.min(10, avgScore / 10));
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

  // Sunlight
  if (input.timeOfDay === "midday" || input.timeOfDay === "morning") {
    reasons.push("Good daylight");
  }

  // Visibility
  if (input.visibility.metres >= 12) {
    reasons.push(`Excellent vis (${input.visibility.metres}m)`);
  } else if (input.visibility.metres >= 8) {
    reasons.push(`Good vis (${input.visibility.metres}m)`);
  }

  // Top species
  const topSpecies = [...input.speciesScores]
    .sort((a, b) => b.likelihood.score - a.likelihood.score)
    .slice(0, 2)
    .filter((s) => s.likelihood.score >= 60);

  if (topSpecies.length > 0) {
    reasons.push(
      `Good chances: ${topSpecies.map((s) => s.speciesName).join(", ")}`
    );
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

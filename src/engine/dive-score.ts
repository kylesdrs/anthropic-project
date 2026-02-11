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
  sharkRisk: SharkRiskAssessment;
  speciesScores: { speciesName: string; likelihood: SpeciesLikelihood }[];
  swell: SwellReading;
  windSpeed: number; // knots
  windDirection: string;
  airTemp: number;
  waterTemp: number | null;
  site: DiveSite;
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
  const visScore = scoreVisibility(input.visibility);
  const fishScore = scoreFishActivity(input.speciesScores);
  const safetyScore = scoreSafety(input.sharkRisk, input.swell, input.site);
  const comfortScore = scoreComfort(
    input.windSpeed,
    input.windDirection,
    input.airTemp,
    input.waterTemp,
    input.site
  );

  // Weighted average
  const overall =
    visScore * 0.3 +
    fishScore * 0.3 +
    safetyScore * 0.25 +
    comfortScore * 0.15;

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
  // Map vis metres to 1-10 score
  // 15m+ = 10, 12m = 9, 10m = 8, 8m = 7, 6m = 6, 4m = 5, 3m = 4, 2m = 3, 1m = 2, <1m = 1
  const m = vis.metres;
  if (m >= 15) return 10;
  if (m >= 12) return 9;
  if (m >= 10) return 8;
  if (m >= 8) return 7;
  if (m >= 6) return 6;
  if (m >= 4) return 5;
  if (m >= 3) return 4;
  if (m >= 2) return 3;
  if (m >= 1) return 2;
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
  sharkRisk: SharkRiskAssessment,
  swell: SwellReading,
  site: DiveSite
): number {
  let score = 10;

  // Shark risk penalty
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

  return Math.max(1, score);
}

function scoreComfort(
  windSpeed: number,
  windDirection: string,
  airTemp: number,
  waterTemp: number | null,
  site: DiveSite
): number {
  let score = 8; // start high — we're going diving!

  // Wind comfort
  if (windSpeed >= 25) {
    score -= 4;
  } else if (windSpeed >= 18) {
    score -= 2.5;
  } else if (windSpeed >= 12) {
    score -= 1;
  } else if (windSpeed < 5) {
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

  // Visibility
  if (input.visibility.metres >= 10) {
    reasons.push(`Excellent vis (${input.visibility.metres}m)`);
  } else if (input.visibility.metres >= 7) {
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

  // Safety
  if (input.sharkRisk.level === "low") {
    reasons.push("Low shark risk");
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

  if (input.visibility.metres < 4) {
    concerns.push(`Low vis (${input.visibility.metres}m)`);
  }

  if (
    input.sharkRisk.level === "elevated" ||
    input.sharkRisk.level === "high"
  ) {
    concerns.push(`${input.sharkRisk.level} shark risk`);
  }

  if (input.swell.height > input.site.bestConditions.swellMax) {
    concerns.push(
      `Swell ${input.swell.height}m exceeds site max ${input.site.bestConditions.swellMax}m`
    );
  }

  if (input.windSpeed >= 18) {
    concerns.push(`Strong wind ${input.windSpeed}kt`);
  }

  return concerns.slice(0, 3);
}

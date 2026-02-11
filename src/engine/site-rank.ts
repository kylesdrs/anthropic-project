/**
 * Site ranking engine.
 *
 * Ranks dive sites based on current conditions fit,
 * estimated visibility, species likelihood, and safety.
 *
 * The ranker answers: "Given current conditions, which site
 * should I dive?" by scoring each site and sorting.
 */

import type { DiveSite } from "../sites/northern-beaches";
import type { WeatherConditions } from "../data/bom";
import type { SwellConditions } from "../data/swell";
import type { SharkActivitySummary } from "../data/sharksmart";
import { nearbyDrumlines } from "../data/sharksmart";
import { estimateVisibility, estimateCurrentStrength } from "./visibility";
import { assessSharkRisk } from "./shark-risk";
import {
  calculateSpeciesLikelihood,
  targetSpecies,
  type SpeciesLikelihood,
} from "./species";
import { calculateDiveScore, type DiveScore } from "./dive-score";
import { getRegulation } from "../data/fisheries";

// --- Types ---

export interface SiteVisibility {
  metres: number;
  rating: string;
  confidence: string;
  factors: { name: string; impact: number; description: string }[];
}

export interface SiteSharkRisk {
  level: string;
  score: number;
  recommendation: string;
}

export interface SiteRanking {
  site: DiveSite;
  rank: number; // 1 = best
  diveScore: DiveScore;
  conditionsFit: ConditionsFit;
  visibility: SiteVisibility;
  sharkRisk: SiteSharkRisk;
  topSpecies: SiteSpecies[];
  warnings: string[];
  explanation: string;
}

export interface ConditionsFit {
  swellOk: boolean;
  swellProtected: boolean;
  windIdeal: boolean;
  tideGood: boolean;
  overallFit: "excellent" | "good" | "fair" | "poor";
}

export interface SiteSpecies {
  name: string;
  likelihood: SpeciesLikelihood;
  regulation: string;
}

export interface RankingInput {
  weather: WeatherConditions;
  swell: SwellConditions;
  sharkActivity: SharkActivitySummary;
  timeOfDay: "dawn" | "morning" | "midday" | "afternoon" | "dusk";
}

// --- Ranking ---

/**
 * Rank all provided dive sites by current conditions.
 */
export function rankSites(
  sites: DiveSite[],
  input: RankingInput
): SiteRanking[] {
  const month = new Date().getMonth() + 1;

  const rankings = sites.map((site) => {
    // 1. Conditions fit
    const conditionsFit = assessConditionsFit(site, input);

    // 2. Visibility estimate
    const visEstimate = estimateVisibility(
      {
        rainfall: input.weather.rainfall,
        swell: input.swell.current,
        windDirection: input.weather.observation.windDirection,
        windSpeed: input.weather.observation.windSpeed,
        tides: input.weather.tides,
        month,
        seaSurfaceTemp: input.weather.seaSurfaceTemp,
      },
      site
    );

    // 3. Current strength estimate
    const currentStrength = estimateCurrentStrength(
      input.swell.current.height,
      input.weather.tides.currentState
    );

    // 4. Species likelihood
    const avgDepth =
      (site.depthRange.min + site.depthRange.max) / 2;

    const topSpecies = targetSpecies
      .filter((sp) =>
        site.targetSpecies.some(
          (ts) =>
            ts.toLowerCase().includes(sp.commonName.split(" ")[0].toLowerCase())
        )
      )
      .map((sp) => {
        const likelihood = calculateSpeciesLikelihood(sp, {
          month,
          waterTemp: input.weather.seaSurfaceTemp ?? 21,
          estimatedVis: visEstimate.metres,
          currentStrength,
          timeOfDay: input.timeOfDay,
          siteStructure: site.structure,
          depth: avgDepth,
        });

        const reg = getRegulation(sp.id);
        const regulation = reg
          ? `${reg.minSizeCm > 0 ? `${reg.minSizeCm}cm min` : "No min size"}${reg.maxSizeCm ? `, ${reg.maxSizeCm}cm max` : ""}, bag ${reg.bagLimit}`
          : "";

        return {
          name: sp.commonName,
          likelihood,
          regulation,
        };
      })
      .sort((a, b) => b.likelihood.score - a.likelihood.score);

    // 5. Shark risk
    const nearEstuary =
      site.id === "dee-why-head" || site.id === "narrabeen-head";
    const drumlines = nearbyDrumlines(site.lat, site.lng, 3);

    const sharkRisk = assessSharkRisk({
      sharkActivity: input.sharkActivity,
      daysSinceSignificantRain: input.weather.rainfall.daysSinceSignificantRain,
      rainfallLast24h: input.weather.rainfall.last24h,
      estimatedVis: visEstimate.metres,
      timeOfDay: input.timeOfDay,
      month,
      nearEstuary,
      drumlinesCoveringSite: drumlines.length,
    });

    // 6. Overall dive score
    const diveScore = calculateDiveScore({
      visibility: visEstimate,
      sharkRisk,
      speciesScores: topSpecies.map((s) => ({
        speciesName: s.name,
        likelihood: s.likelihood,
      })),
      swell: input.swell.current,
      windSpeed: input.weather.observation.windSpeed,
      windDirection: input.weather.observation.windDirection,
      airTemp: input.weather.observation.airTemp,
      waterTemp: input.weather.seaSurfaceTemp,
      site,
    });

    // 7. Warnings
    const warnings = generateWarnings(site, input, conditionsFit, sharkRisk);

    // 8. Build explanation paragraph
    const explanation = generateScoreExplanation(
      site, input, diveScore, conditionsFit, visEstimate, topSpecies, sharkRisk
    );

    return {
      site,
      rank: 0, // will be set after sorting
      diveScore,
      conditionsFit,
      visibility: {
        metres: visEstimate.metres,
        rating: visEstimate.rating,
        confidence: visEstimate.confidence,
        factors: visEstimate.factors,
      },
      sharkRisk: {
        level: sharkRisk.level,
        score: sharkRisk.score,
        recommendation: sharkRisk.recommendation,
      },
      topSpecies,
      warnings,
      explanation,
    };
  });

  // Sort by dive score descending
  rankings.sort((a, b) => b.diveScore.overall - a.diveScore.overall);

  // Assign ranks
  rankings.forEach((r, i) => {
    r.rank = i + 1;
  });

  return rankings;
}

// --- Conditions fit ---

function assessConditionsFit(
  site: DiveSite,
  input: RankingInput
): ConditionsFit {
  const swellOk =
    input.swell.current.height <= site.bestConditions.swellMax;

  const swellProtected =
    site.bestConditions.swellDirectionProtected.length === 0 ||
    site.bestConditions.swellDirectionProtected.includes(
      input.swell.current.direction
    );

  const windIdeal = site.bestConditions.windDirectionIdeal.includes(
    input.weather.observation.windDirection
  );

  const tideGood =
    site.bestConditions.tidePreference === "any" ||
    (site.bestConditions.tidePreference === "rising" &&
      input.weather.tides.currentState === "rising") ||
    (site.bestConditions.tidePreference === "high" &&
      (input.weather.tides.currentState === "high_slack" ||
        input.weather.tides.currentState === "rising"));

  // Overall fit
  const fitScore =
    (swellOk ? 1 : 0) +
    (swellProtected ? 1 : 0) +
    (windIdeal ? 1 : 0) +
    (tideGood ? 1 : 0);

  let overallFit: ConditionsFit["overallFit"];
  if (fitScore >= 4) overallFit = "excellent";
  else if (fitScore >= 3) overallFit = "good";
  else if (fitScore >= 2) overallFit = "fair";
  else overallFit = "poor";

  return { swellOk, swellProtected, windIdeal, tideGood, overallFit };
}

// --- Score explanation ---

function generateScoreExplanation(
  site: DiveSite,
  input: RankingInput,
  diveScore: DiveScore,
  fit: ConditionsFit,
  vis: { metres: number; rating: string },
  topSpecies: SiteSpecies[],
  sharkRisk: { level: string; score: number }
): string {
  const parts: string[] = [];
  const score = diveScore.overall;
  const swell = input.swell.current;
  const wind = input.weather.observation;
  const tide = input.weather.tides;

  // Opening — score context
  const label = diveScore.label.toLowerCase();
  parts.push(
    `${site.name} scores ${score}/10 (${diveScore.label}) today.`
  );

  // Swell explanation
  if (fit.swellOk) {
    const protectedNote = fit.swellProtected
      ? `, and the ${swell.direction} direction is one this spot handles well`
      : `, though the ${swell.direction} swell direction isn't ideal — the site is more exposed from that angle`;
    parts.push(
      `The ${swell.height}m swell at ${swell.period}s is within the ${site.bestConditions.swellMax}m limit${protectedNote}.`
    );
  } else {
    parts.push(
      `The ${swell.height}m swell exceeds this site's ${site.bestConditions.swellMax}m safe limit, which is the main concern.`
    );
  }

  // Wind explanation
  const offshore = ["W", "WSW", "SW", "WNW", "NW", "NNW"];
  const isOffshore = offshore.includes(wind.windDirection);
  if (fit.windIdeal) {
    parts.push(
      `${wind.windDirection} wind at ${wind.windSpeed}kt is ${isOffshore ? "offshore here — flattening the surface and improving clarity" : "an ideal direction for this spot"}.`
    );
  } else if (isOffshore) {
    parts.push(
      `${wind.windDirection} at ${wind.windSpeed}kt is offshore, which helps with surface conditions${wind.windSpeed >= 20 ? ", though it's getting strong" : ""}.`
    );
  } else {
    parts.push(
      `${wind.windDirection} at ${wind.windSpeed}kt is onshore here${wind.windSpeed >= 15 ? " and pushing chop and dirty water in" : ""}, which isn't ideal.`
    );
  }

  // Visibility
  parts.push(
    `Visibility is estimated at ${vis.metres}m (${vis.rating}).`
  );

  // Tide
  const tideState = tide.currentState.replace("_", " ");
  if (fit.tideGood) {
    parts.push(
      `The ${tideState} tide works well here${tide.currentState === "rising" ? " — clean ocean water is pushing inshore over the reef" : ""}.`
    );
  } else {
    parts.push(
      `The ${tideState} tide isn't the best for this spot — ${site.bestConditions.tidePreference === "rising" ? "a rising tide would bring cleaner water in" : "higher tide would be better for access"}.`
    );
  }

  // Species
  const goodSpecies = topSpecies.filter(s => s.likelihood.score >= 50);
  if (goodSpecies.length > 0) {
    const speciesStr = goodSpecies
      .slice(0, 3)
      .map(s => `${s.name} (${s.likelihood.score}%)`)
      .join(", ");
    parts.push(
      `Best chances today: ${speciesStr}.`
    );
  } else if (topSpecies.length > 0) {
    parts.push(
      `Fish activity is on the lower side — ${topSpecies[0].name} at ${topSpecies[0].likelihood.score}% is the best prospect.`
    );
  }

  // Shark risk (only if notable)
  if (sharkRisk.level === "elevated" || sharkRisk.level === "high") {
    parts.push(
      `Shark risk is ${sharkRisk.level} — worth factoring into your decision.`
    );
  } else if (sharkRisk.level === "low") {
    parts.push(`Shark risk is low.`);
  }

  // Rain context (if significant)
  const rain = input.weather.rainfall;
  if (rain.last24h >= 10) {
    parts.push(
      `Note: ${rain.last24h}mm of rain in the last 24 hours means runoff will be affecting water quality.`
    );
  } else if (rain.daysSinceSignificantRain >= 5) {
    parts.push(
      `${rain.daysSinceSignificantRain} days since significant rain is helping water clarity.`
    );
  }

  return parts.join(" ");
}

// --- Warnings ---

function generateWarnings(
  site: DiveSite,
  input: RankingInput,
  fit: ConditionsFit,
  sharkRisk: { level: string }
): string[] {
  const warnings: string[] = [];

  if (!fit.swellOk) {
    warnings.push(
      `Swell ${input.swell.current.height}m exceeds site max ${site.bestConditions.swellMax}m`
    );
  }

  if (input.swell.trend === "building") {
    warnings.push("Swell is building — conditions may deteriorate");
  }

  if (
    sharkRisk.level === "elevated" ||
    sharkRisk.level === "high"
  ) {
    warnings.push(`${sharkRisk.level} shark risk at this location`);
  }

  if (input.weather.observation.windSpeed >= 20) {
    warnings.push(
      `Strong wind ${input.weather.observation.windSpeed}kt ${input.weather.observation.windDirection}`
    );
  }

  if (site.status === "no-take") {
    warnings.push("No-take zone — spearfishing prohibited");
  } else if (site.status === "restricted") {
    warnings.push(`Restricted: ${site.restrictions}`);
  }

  return warnings;
}

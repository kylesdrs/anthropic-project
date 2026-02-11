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

export interface SiteRanking {
  site: DiveSite;
  rank: number; // 1 = best
  diveScore: DiveScore;
  conditionsFit: ConditionsFit;
  topSpecies: SiteSpecies[];
  warnings: string[];
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

    return {
      site,
      rank: 0, // will be set after sorting
      diveScore,
      conditionsFit,
      topSpecies,
      warnings,
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

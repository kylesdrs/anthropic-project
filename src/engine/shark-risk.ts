/**
 * Shark risk assessment.
 *
 * Evaluates risk level based on recent alerts, rainfall,
 * water clarity, time of day, and proximity to estuaries.
 *
 * This is NOT a shark-attack predictor. It's a relative risk
 * indicator to help make informed decisions. The baseline risk
 * of shark encounters in Sydney is low. This module identifies
 * conditions that elevate or lower that baseline.
 *
 * Risk factors (evidence-based):
 * - Recent activity: tagged detections, sightings, drumline catches
 * - Rainfall/runoff: dirty water near estuary outflows attracts bulls
 * - Time of day: dawn/dusk are higher risk (low light)
 * - Water clarity: low vis = reduced ability to see sharks
 * - Season: summer = more sharks, more people
 * - Proximity to infrastructure: drumlines = active management
 */

import type { SharkAlert, SharkActivitySummary } from "../data/sharksmart";

// --- Types ---

export interface SharkRiskInput {
  sharkActivity: SharkActivitySummary;
  daysSinceSignificantRain: number;
  rainfallLast24h: number;
  estimatedVis: number; // metres
  timeOfDay: "dawn" | "morning" | "midday" | "afternoon" | "dusk";
  month: number;
  nearEstuary: boolean;
  drumlinesCoveringSite: number; // count of nearby active drumlines
}

export interface SharkRiskAssessment {
  level: "low" | "moderate" | "elevated" | "high";
  score: number; // 0-100 (higher = more risk)
  factors: SharkRiskFactor[];
  recommendation: string;
  recentAlerts: SharkAlert[];
}

export interface SharkRiskFactor {
  name: string;
  points: number; // positive = increases risk
  description: string;
}

// --- Assessment ---

/**
 * Assess shark risk for a dive site.
 *
 * Returns a 0-100 score where:
 * 0-20 = low, 21-40 = moderate, 41-60 = elevated, 61+ = high
 */
export function assessSharkRisk(input: SharkRiskInput): SharkRiskAssessment {
  let score = 15; // baseline — there are always sharks in the ocean
  const factors: SharkRiskFactor[] = [];

  // --- 1. Recent shark activity (up to +30) ---
  const activityFactor = assessRecentActivity(input.sharkActivity);
  score += activityFactor.points;
  factors.push(activityFactor);

  // --- 2. Rainfall and runoff (up to +15) ---
  const rainfallFactor = assessRainfallRisk(
    input.rainfallLast24h,
    input.daysSinceSignificantRain,
    input.nearEstuary
  );
  score += rainfallFactor.points;
  factors.push(rainfallFactor);

  // --- 3. Water clarity (up to +10) ---
  const visFactor = assessVisibilityRisk(input.estimatedVis);
  score += visFactor.points;
  factors.push(visFactor);

  // --- 4. Time of day (up to +10) ---
  const timeFactor = assessTimeRisk(input.timeOfDay);
  score += timeFactor.points;
  factors.push(timeFactor);

  // --- 5. Season (up to +10) ---
  const seasonFactor = assessSeasonRisk(input.month);
  score += seasonFactor.points;
  factors.push(seasonFactor);

  // --- 6. Drumline coverage (mitigation, up to -10) ---
  const drumlineFactor = assessDrumlineCoverage(input.drumlinesCoveringSite);
  score += drumlineFactor.points;
  factors.push(drumlineFactor);

  // Clamp
  score = Math.max(0, Math.min(100, score));

  const level = riskLevel(score);
  const recommendation = generateRecommendation(level, factors, input);

  // Include recent alerts for context
  const recentAlerts = input.sharkActivity.alerts.slice(0, 5);

  return { level, score, factors, recommendation, recentAlerts };
}

// --- Individual risk factors ---

function assessRecentActivity(
  activity: SharkActivitySummary
): SharkRiskFactor {
  const alerts = activity.alerts;
  const days = activity.daysSinceLastActivity;

  if (alerts.length === 0 || days === null) {
    return {
      name: "Recent Activity",
      points: 0,
      description: "No recent shark activity recorded nearby",
    };
  }

  // Weight by recency and type
  let points = 0;

  // Count by type (last 7 days)
  const recent7d = alerts.filter((a) => {
    const daysAgo =
      (Date.now() - new Date(a.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= 7;
  });

  const whiteSharkCount = recent7d.filter(
    (a) => a.species === "white"
  ).length;
  const bullSharkCount = recent7d.filter(
    (a) => a.species === "bull"
  ).length;
  const incidents = recent7d.filter((a) => a.type === "incident").length;

  if (incidents > 0) {
    points += 25;
  }

  // White sharks are the primary concern
  if (whiteSharkCount >= 2) {
    points += 20;
  } else if (whiteSharkCount === 1) {
    points += 12;
  }

  // Bull sharks near estuaries
  if (bullSharkCount >= 1) {
    points += 8;
  }

  // General activity level
  if (recent7d.length >= 4) {
    points += 5;
  }

  // Recency weighting
  if (days <= 1) {
    points += 5;
  } else if (days <= 3) {
    points += 2;
  }

  // Cap at 30
  points = Math.min(30, points);

  const descriptions: string[] = [];
  if (whiteSharkCount > 0)
    descriptions.push(`${whiteSharkCount} white shark alert(s) in last 7 days`);
  if (bullSharkCount > 0)
    descriptions.push(`${bullSharkCount} bull shark alert(s)`);
  if (incidents > 0) descriptions.push(`${incidents} incident(s) reported`);
  if (descriptions.length === 0)
    descriptions.push(
      `${recent7d.length} alert(s) in last 7 days, last activity ${days} day(s) ago`
    );

  return {
    name: "Recent Activity",
    points,
    description: descriptions.join("; "),
  };
}

function assessRainfallRisk(
  rainfallLast24h: number,
  daysSinceSignificantRain: number,
  nearEstuary: boolean
): SharkRiskFactor {
  // Heavy rain + estuary = elevated bull shark risk
  // Runoff attracts baitfish, which attracts sharks
  let points = 0;
  const descriptions: string[] = [];

  if (rainfallLast24h >= 15 && nearEstuary) {
    points += 12;
    descriptions.push(
      "Heavy rain near estuary — runoff attracts baitfish and bull sharks"
    );
  } else if (rainfallLast24h >= 10) {
    points += 6;
    descriptions.push("Recent heavy rain — increased baitfish activity");
  } else if (rainfallLast24h >= 5 && nearEstuary) {
    points += 4;
    descriptions.push("Moderate rain near estuary — some runoff effect");
  } else if (daysSinceSignificantRain >= 7) {
    points -= 3;
    descriptions.push("Extended dry period — reduced runoff-related risk");
  }

  points = Math.max(-5, Math.min(15, points));

  return {
    name: "Rainfall/Runoff",
    points,
    description:
      descriptions.length > 0
        ? descriptions.join("; ")
        : "Neutral rainfall conditions",
  };
}

function assessVisibilityRisk(vis: number): SharkRiskFactor {
  // Low vis = can't see sharks = higher effective risk
  // Note: some species (bulls) prefer dirty water

  let points: number;
  let description: string;

  if (vis < 2) {
    points = 10;
    description =
      "Very low vis (<2m) — cannot see approaching sharks. Higher risk.";
  } else if (vis < 4) {
    points = 5;
    description = "Low vis — reduced ability to spot sharks early";
  } else if (vis >= 10) {
    points = -3;
    description = "Excellent vis — good awareness of surroundings";
  } else {
    points = 0;
    description = "Adequate vis for situational awareness";
  }

  return { name: "Visibility", points, description };
}

function assessTimeRisk(
  timeOfDay: SharkRiskInput["timeOfDay"]
): SharkRiskFactor {
  // Dawn and dusk are higher risk — sharks feed actively in low light
  switch (timeOfDay) {
    case "dawn":
      return {
        name: "Time of Day",
        points: 8,
        description:
          "Dawn — sharks feed actively in low light. Higher risk period.",
      };
    case "dusk":
      return {
        name: "Time of Day",
        points: 10,
        description:
          "Dusk — peak shark feeding time. Highest risk period of day.",
      };
    case "morning":
      return {
        name: "Time of Day",
        points: 2,
        description: "Morning — moderate activity, some residual dawn risk",
      };
    case "afternoon":
      return {
        name: "Time of Day",
        points: 2,
        description: "Afternoon — building towards dusk feeding time",
      };
    case "midday":
      return {
        name: "Time of Day",
        points: -2,
        description: "Midday — lowest shark activity period",
      };
  }
}

function assessSeasonRisk(month: number): SharkRiskFactor {
  // Summer: more sharks inshore (warm water, baitfish)
  // Winter: fewer sharks, less baitfish
  // Note: white sharks migrate south in summer following warm currents

  if ([12, 1, 2, 3].includes(month)) {
    return {
      name: "Season",
      points: 5,
      description:
        "Summer — white sharks migrating south, bull sharks active inshore",
    };
  } else if ([4, 5].includes(month)) {
    return {
      name: "Season",
      points: 3,
      description: "Autumn — sharks still active, baitfish moving offshore",
    };
  } else if ([6, 7, 8].includes(month)) {
    return {
      name: "Season",
      points: -3,
      description: "Winter — fewer sharks inshore, reduced baseline risk",
    };
  } else {
    return {
      name: "Season",
      points: 2,
      description: "Spring — sharks returning, activity increasing",
    };
  }
}

function assessDrumlineCoverage(drumlineCount: number): SharkRiskFactor {
  if (drumlineCount >= 2) {
    return {
      name: "Drumline Coverage",
      points: -8,
      description: `${drumlineCount} SMART drumlines nearby — active shark management`,
    };
  } else if (drumlineCount === 1) {
    return {
      name: "Drumline Coverage",
      points: -4,
      description: "1 SMART drumline nearby — some active management",
    };
  } else {
    return {
      name: "Drumline Coverage",
      points: 2,
      description: "No SMART drumlines near this site",
    };
  }
}

// --- Helpers ---

function riskLevel(score: number): SharkRiskAssessment["level"] {
  if (score <= 20) return "low";
  if (score <= 40) return "moderate";
  if (score <= 60) return "elevated";
  return "high";
}

function generateRecommendation(
  level: SharkRiskAssessment["level"],
  factors: SharkRiskFactor[],
  input: SharkRiskInput
): string {
  const topRisk = factors
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)[0];

  switch (level) {
    case "low":
      return "Low shark risk. Standard precautions apply — dive with a buddy, avoid dawn/dusk, stay aware.";

    case "moderate":
      return `Moderate shark risk. ${topRisk ? topRisk.description + "." : ""} Exercise normal caution, stay alert, and dive with a buddy.`;

    case "elevated":
      return `Elevated shark risk. ${topRisk ? topRisk.description + "." : ""} Consider postponing if you're uncomfortable. If diving, stay close to shore, dive in a group, and avoid murky water.`;

    case "high":
      return `High shark risk — strongly consider postponing. ${topRisk ? topRisk.description + "." : ""} Multiple risk factors are elevated. If you still choose to dive, stay very close to shore, dive in a group, keep sessions short, and have a clear exit plan.`;
  }
}

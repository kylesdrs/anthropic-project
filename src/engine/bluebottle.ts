/**
 * Bluebottle/Portuguese Man O' War sting risk assessor.
 *
 * Uses wind direction and speed heuristic: NE-quadrant onshore winds
 * (NE, ENE, E) at moderate-or-higher speed over recent hours raise risk.
 *
 * Bluebottles are carried onshore on warm winds; NE winds in summer/spring
 * bring them in from the northern current streams.
 */

// --- Types ---

export interface BluebottleRisk {
  riskLevel: "low" | "moderate" | "high";
  score: number; // 0-100
  reason: string;
  windFactor: string;
  recommendation: string;
}

// --- Risk Calculation ---

/**
 * Assess bluebottle/stinger risk based on wind conditions.
 *
 * Factors:
 * - Wind direction: NE quadrant (NE, ENE, E) = high risk
 * - Wind speed: >10kt = moderate, >15kt = high
 * - Historical context: recent hours' avg improves accuracy
 */
export function assessBluebottleRisk(
  windDirection: string,
  windSpeed: number,
  recentWindHistory?: Array<{ speed: number; direction: string }>
): BluebottleRisk {
  // NE-quadrant onshore directions
  const riskDirections = new Set(["NE", "ENE", "E"]);
  const moderateDirections = new Set(["N", "NNE", "ESE", "SE"]);
  const noRiskDirections = new Set(["S", "SSE", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]);

  let directionScore = 0;
  if (riskDirections.has(windDirection)) {
    directionScore = 60; // High-risk onshore wind
  } else if (moderateDirections.has(windDirection)) {
    directionScore = 30; // Moderate risk
  } else if (noRiskDirections.has(windDirection)) {
    directionScore = 10; // Low risk
  }

  // Speed factor: higher speeds carry more bluebottles
  let speedScore = 0;
  if (windSpeed >= 20) speedScore = 40;
  else if (windSpeed >= 15) speedScore = 30;
  else if (windSpeed >= 10) speedScore = 15;
  else if (windSpeed >= 5) speedScore = 5;

  // Historical context: if recent hours show trend toward current conditions
  let historyBoost = 0;
  if (recentWindHistory && recentWindHistory.length > 0) {
    const avgHistorySpeed = recentWindHistory.reduce((sum, w) => sum + w.speed, 0) / recentWindHistory.length;
    const riskDirectionCount = recentWindHistory.filter((w) => riskDirections.has(w.direction)).length;
    const persistenceBoost = (riskDirectionCount / recentWindHistory.length) * 20;
    historyBoost = Math.min(20, persistenceBoost);
  }

  const score = Math.min(100, directionScore + speedScore + historyBoost);

  // Classify risk
  let riskLevel: BluebottleRisk["riskLevel"];
  if (score >= 70) riskLevel = "high";
  else if (score >= 40) riskLevel = "moderate";
  else riskLevel = "low";

  // Generate explanation
  let windFactor = "";
  if (riskDirections.has(windDirection)) {
    windFactor = `NE-quadrant wind (${windDirection}) carrying bluebottles onshore`;
  } else if (moderateDirections.has(windDirection)) {
    windFactor = `Moderate onshore wind (${windDirection}); some bluebottle risk`;
  } else {
    windFactor = `Offshore/cross wind (${windDirection}); low bluebottle risk`;
  }

  if (windSpeed >= 15) {
    windFactor += ` at ${Math.round(windSpeed)}kt — strong onshore push`;
  } else if (windSpeed >= 10) {
    windFactor += ` at ${Math.round(windSpeed)}kt — moderate push`;
  }

  // Recommendation
  let recommendation = "";
  if (riskLevel === "high") {
    recommendation = "High sting risk. Wear protective clothing. Consider different site or wait for wind shift.";
  } else if (riskLevel === "moderate") {
    recommendation = "Moderate sting risk. Wear a rash guard or consider protective gear. Monitor conditions.";
  } else {
    recommendation = "Low sting risk today. Standard precautions sufficient.";
  }

  return {
    riskLevel,
    score,
    reason: `Bluebottle risk is ${riskLevel}. ${windFactor}.`,
    windFactor,
    recommendation,
  };
}

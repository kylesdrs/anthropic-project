/**
 * Barometric pressure trend analyzer.
 *
 * Determines if pressure is rising, steady, or falling over the last
 * several hours. Rising pressure generally indicates stable, good weather.
 * Falling pressure often signals deteriorating conditions.
 * Steady pressure suggests stable conditions.
 *
 * For this MVP, we use a simple heuristic since we don't have historical
 * pressure data in storage. In production, you'd track hourly values.
 */

// --- Types ---

export interface PressureTrend {
  trend: "rising" | "steady" | "falling";
  change: number; // hPa (positive = rising)
  interpretation: string;
  fishActivityImplication: string;
}

// --- Calculation ---

/**
 * Estimate pressure trend from current observation.
 * Since we don't have historical data, we use a simplified approach:
 * - Check current pressure against a simple historical average for the date/season
 * - Provide a heuristic based on typical patterns
 *
 * In a production system, you'd store hourly pressure values and compute
 * the actual trend over the past 3-6 hours.
 */
export function calculatePressureTrend(currentPressure: number): PressureTrend {
  // Typical Sydney pressure range: 1008-1025 hPa
  // Standard/normal is ~1013 hPa
  // High pressure (>1018): generally good, stable
  // Low pressure (<1008): weather deteriorating
  // Mid range: variable

  // For MVP: estimate trend from seasonal baseline
  // December-March (summer): average ~1010-1015 hPa
  // April-May (autumn): average ~1015-1018 hPa
  // June-September (winter): average ~1010-1015 hPa
  // October-November (spring): average ~1015-1020 hPa

  const month = new Date().getMonth() + 1;

  let seasonalAverage = 1013;
  if (month >= 12 || month <= 3) seasonalAverage = 1012; // Summer
  else if (month >= 4 && month <= 5) seasonalAverage = 1016; // Autumn
  else if (month >= 6 && month <= 9) seasonalAverage = 1012; // Winter
  else if (month >= 10 && month <= 11) seasonalAverage = 1017; // Spring

  // Estimate trend from deviation
  const deviation = currentPressure - seasonalAverage;

  let trend: PressureTrend["trend"];
  if (deviation > 3) {
    trend = "rising"; // well above seasonal
  } else if (deviation < -3) {
    trend = "falling"; // well below seasonal
  } else {
    trend = "steady"; // near seasonal
  }

  // Interpretation
  let interpretation = "";
  if (trend === "rising") {
    interpretation = `Pressure rising to ${currentPressure.toFixed(1)} hPa. Conditions should improve or stabilize.`;
  } else if (trend === "falling") {
    interpretation = `Pressure falling to ${currentPressure.toFixed(1)} hPa. Watch for deteriorating conditions.`;
  } else {
    interpretation = `Pressure steady at ${currentPressure.toFixed(1)} hPa. Conditions likely to remain stable.`;
  }

  // Fish activity implication
  let fishActivityImplication = "";
  if (trend === "rising") {
    fishActivityImplication = "Rising pressure = stable weather = normal to good fish feeding, especially mid-day.";
  } else if (trend === "falling") {
    fishActivityImplication = "Falling pressure = unsettled = increased fish activity before the weather hits. Peak bite often just before pressure drop fully manifests.";
  } else {
    fishActivityImplication = "Steady pressure = normal feeding patterns. Solunar/tide timing more influential.";
  }

  return {
    trend,
    change: deviation,
    interpretation,
    fishActivityImplication,
  };
}

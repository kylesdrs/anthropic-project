/**
 * Tidal range and spring/neap tide classifier.
 *
 * Computes the day's tidal range (high minus low height) and classifies
 * whether conditions are spring (large range) or neap (small range).
 *
 * Spring tides occur near full/new moon (every ~14 days).
 * Neap tides occur near quarter moons (every ~14 days).
 */

import type { TidePoint } from "../data/bom";

// --- Types ---

export interface TideRangeData {
  todaysRange: number; // metres (high - low)
  classification: "spring" | "neap";
  explanation: string;
  nextHighHeight: number | null; // metres
  nextLowHeight: number | null; // metres
  currentState: string;
}

// --- Calculation ---

/**
 * Calculate today's tidal range and spring/neap classification.
 *
 * Spring tide: range typically 1.4-1.8m (large)
 * Neap tide: range typically 0.6-1.0m (small)
 * Average: ~1.2m
 */
export function calculateTideRange(predictions: TidePoint[]): TideRangeData {
  // Filter for today's predictions
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const todaysPredictions = predictions.filter((p) => {
    const pTime = new Date(p.time);
    return pTime >= todayStart && pTime < tomorrowStart;
  });

  // Find high and low points for today
  const highs = todaysPredictions.filter((p) => p.type === "high").map((p) => p.height);
  const lows = todaysPredictions.filter((p) => p.type === "low").map((p) => p.height);

  let range = 0;
  let nextHighHeight: number | null = null;
  let nextLowHeight: number | null = null;

  if (highs.length > 0 && lows.length > 0) {
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    range = maxHigh - minLow;
    nextHighHeight = maxHigh;
    nextLowHeight = minLow;
  }

  // Classify spring vs neap
  // Average range for Sydney is ~1.2m
  // Spring: > 1.3m, Neap: < 1.1m, Transition: in between
  const classification = range > 1.3 ? "spring" : "neap";

  // Explanation
  let explanation = "";
  if (classification === "spring") {
    explanation = `Spring tide today with ${range.toFixed(2)}m range. Strong currents and bait movement — good for kingfish.`;
  } else {
    explanation = `Neap tide today with ${range.toFixed(2)}m range. Weak currents and slack water — lulls in fish activity.`;
  }

  // Get current state from latest prediction
  const currentState = "tidal-state"; // Placeholder; would be filled from tide state data

  return {
    todaysRange: Math.round(range * 100) / 100,
    classification,
    explanation,
    nextHighHeight: nextHighHeight ? Math.round(nextHighHeight * 100) / 100 : null,
    nextLowHeight: nextLowHeight ? Math.round(nextLowHeight * 100) / 100 : null,
    currentState,
  };
}

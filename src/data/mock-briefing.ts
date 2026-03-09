/**
 * Client-side mock briefing data.
 *
 * Used as a fallback when /api/briefing is unreachable
 * (e.g. server not running, network error).
 * Generates realistic, time-relative data so the dashboard
 * always renders something meaningful.
 */

function hoursFromNow(h: number): string {
  const d = new Date();
  d.setHours(d.getHours() + h);
  return d.toISOString();
}

function daysAgo(d: number): string {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(6 + Math.floor(Math.random() * 10));
  return date.toISOString();
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 5) return "night";
  if (h < 6) return "dawn";
  if (h < 10) return "morning";
  if (h < 14) return "midday";
  if (h < 17) return "afternoon";
  if (h < 19) return "dusk";
  return "night";
}

function generateTidePredictions() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tidalPeriodMs = 12 * 60 * 60 * 1000 + 25 * 60 * 1000;
  const dayOffset = (now.getDate() * 47) % 720;
  const firstHighMs = startOfDay.getTime() + dayOffset * 60 * 1000;

  const points: { time: string; height: number; type: "high" | "low" }[] = [];
  for (let i = -1; i < 4; i++) {
    const highMs = firstHighMs + i * tidalPeriodMs;
    const lowMs = highMs + tidalPeriodMs / 2;
    points.push({
      time: new Date(highMs).toISOString(),
      height: +(1.5 + Math.sin(i * 0.3) * 0.2).toFixed(2),
      type: "high",
    });
    points.push({
      time: new Date(lowMs).toISOString(),
      height: +(0.4 + Math.sin(i * 0.3) * 0.1).toFixed(2),
      type: "low",
    });
  }
  points.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Find next high/low from now
  const nowMs = now.getTime();
  const nextHigh = points.find((p) => p.type === "high" && new Date(p.time).getTime() > nowMs) ?? null;
  const nextLow = points.find((p) => p.type === "low" && new Date(p.time).getTime() > nowMs) ?? null;

  return { predictions: points, currentState: "mid_rising" as const, nextHigh, nextLow };
}

export function generateMockBriefing() {
  const tides = generateTidePredictions();

  return {
    generatedAt: new Date().toISOString(),
    timeOfDay: getTimeOfDay(),
    conditions: {
      weather: {
        observation: {
          timestamp: new Date().toISOString(),
          airTemp: 24,
          humidity: 68,
          windSpeed: 8,
          windGust: 14,
          windDirection: "NW",
          windDirectionDeg: 315,
          pressure: 1018,
          rainfall: 0,
          cloud: "Partly cloudy",
        },
        tides,
        rainfall: {
          last24h: 0,
          last48h: 2.4,
          last72h: 2.4,
          daysSinceSignificantRain: 5,
        },
        seaSurfaceTemp: 22.3,
        fetchedAt: new Date().toISOString(),
      },
      swell: {
        current: {
          timestamp: new Date().toISOString(),
          height: 1.2,
          period: 10,
          direction: "SSE",
          directionDeg: 155,
        },
        secondary: {
          timestamp: new Date().toISOString(),
          height: 0.5,
          period: 7,
          direction: "E",
          directionDeg: 90,
        },
        trend: "holding",
        forecast: Array.from({ length: 24 }, (_, i) => ({
          timestamp: hoursFromNow(i * 3),
          height: +(1.2 + Math.sin(i / 4) * 0.4).toFixed(1),
          period: +(10 + Math.sin(i / 6) * 2).toFixed(0),
          direction: "SSE",
          directionDeg: 155,
        })),
        windForecast: [],
        weatherForecast: [],
        fetchedAt: new Date().toISOString(),
      },
      sharkActivity: {
        alerts: [],
        daysSinceLastActivity: null,
        source: "seed",
        fetchedAt: new Date().toISOString(),
      },
    },
    visibility: {
      metres: 8.5,
      confidence: "high",
      rating: "good",
      factors: [
        { name: "Rainfall", impact: 2, description: "5 days since significant rain — water has had time to clear" },
        { name: "Swell", impact: -1, description: "1.2m mid-period — moderate bottom disturbance" },
        { name: "Wind", impact: 1.5, description: "Offshore NW 8kt — flattening surface, improving vis" },
        { name: "Tide", impact: 1, description: "Rising tide — cleaner ocean water pushing inshore" },
        { name: "Season", impact: 1, description: "Summer — typically better vis with EAC influence" },
        { name: "Site", impact: 0, description: "No significant site-specific modifier" },
      ],
    },
    siteRankings: [
      {
        site: { id: "bluefish-point", name: "Bluefish Point", status: "legal", restrictions: "Outside Cabbage Tree Bay Aquatic Reserve" },
        rank: 1,
        diveScore: {
          overall: 7.2,
          label: "Good",
          breakdown: { visibility: 7, conditionsFit: 7.5, safety: 7, comfort: 8 },
          topReasons: ["Good vis (8.5m)", "Light offshore NW"],
          concerns: [],
        },
        conditionsFit: { swellOk: false, windIdeal: true, tideGood: true, overallFit: "good" },
        topSpecies: [
          { name: "Yellowtail Kingfish", regulation: "65cm min, bag 5", seasonRange: "Oct–May", inTempRange: true },
          { name: "Silver Trevally", regulation: "No min size, bag 20", seasonRange: "Oct–Apr", inTempRange: true },
          { name: "Australian Bonito", regulation: "No min size, bag 20", seasonRange: "Nov–Apr", inTempRange: true },
          { name: "Snapper", regulation: "30cm min, bag 10", seasonRange: "Apr–Aug", inTempRange: true },
        ],
        warnings: [],
      },
      {
        site: { id: "freshwater-headland", name: "Freshwater Headland", status: "legal", restrictions: "Outside Cabbage Tree Bay reserve" },
        rank: 2,
        diveScore: {
          overall: 6.8,
          label: "Good",
          breakdown: { visibility: 7, conditionsFit: 7, safety: 6.5, comfort: 7.5 },
          topReasons: ["Good vis (8.5m)"],
          concerns: [],
        },
        conditionsFit: { swellOk: false, windIdeal: true, tideGood: true, overallFit: "fair" },
        topSpecies: [
          { name: "Yellowtail Kingfish", regulation: "65cm min, bag 5", seasonRange: "Oct–May", inTempRange: true },
          { name: "Silver Trevally", regulation: "No min size, bag 20", seasonRange: "Oct–Apr", inTempRange: true },
          { name: "Snapper", regulation: "30cm min, bag 10", seasonRange: "Apr–Aug", inTempRange: true },
        ],
        warnings: [],
      },
      {
        site: { id: "long-reef", name: "Long Reef", status: "restricted", restrictions: "Spearfishing for finfish only" },
        rank: 3,
        diveScore: {
          overall: 6.4,
          label: "Fair",
          breakdown: { visibility: 6.5, conditionsFit: 7, safety: 6, comfort: 6.5 },
          topReasons: [],
          concerns: ["Swell 1.2m exceeds site max 1.0m"],
        },
        conditionsFit: { swellOk: false, windIdeal: true, tideGood: true, overallFit: "fair" },
        topSpecies: [
          { name: "Yellowtail Kingfish", regulation: "65cm min, bag 5", seasonRange: "Oct–May", inTempRange: true },
          { name: "Australian Bonito", regulation: "No min size, bag 20", seasonRange: "Nov–Apr", inTempRange: true },
          { name: "Silver Trevally", regulation: "No min size, bag 20", seasonRange: "Oct–Apr", inTempRange: true },
        ],
        warnings: ["Swell 1.2m exceeds site max 1.0m", "Restricted: Spearfishing for finfish only"],
      },
      {
        site: { id: "narrabeen-head", name: "Narrabeen Head", status: "restricted", restrictions: "Spearfishing for finfish only" },
        rank: 4,
        diveScore: {
          overall: 6.1,
          label: "Fair",
          breakdown: { visibility: 6.5, conditionsFit: 6, safety: 6, comfort: 7 },
          topReasons: ["Good vis (8.5m)"],
          concerns: [],
        },
        conditionsFit: { swellOk: true, windIdeal: true, tideGood: true, overallFit: "good" },
        topSpecies: [
          { name: "Snapper", regulation: "30cm min, bag 10", seasonRange: "Apr–Aug", inTempRange: true },
          { name: "Yellowtail Kingfish", regulation: "65cm min, bag 5", seasonRange: "Oct–May", inTempRange: true },
          { name: "Dusky Flathead", regulation: "36-70cm slot, bag 10", seasonRange: "Year-round", inTempRange: true },
        ],
        warnings: ["Restricted: Spearfishing for finfish only"],
      },
      {
        site: { id: "curl-curl-headland", name: "Curl Curl Headland", status: "legal", restrictions: "No special restrictions" },
        rank: 5,
        diveScore: {
          overall: 5.8,
          label: "Fair",
          breakdown: { visibility: 6.5, conditionsFit: 5.5, safety: 5.5, comfort: 7 },
          topReasons: ["Good vis (8.5m)"],
          concerns: [],
        },
        conditionsFit: { swellOk: false, windIdeal: true, tideGood: true, overallFit: "fair" },
        topSpecies: [
          { name: "Silver Trevally", regulation: "No min size, bag 20", seasonRange: "Oct–Apr", inTempRange: true },
          { name: "Snapper", regulation: "30cm min, bag 10", seasonRange: "Apr–Aug", inTempRange: true },
          { name: "Dusky Flathead", regulation: "36-70cm slot, bag 10", seasonRange: "Year-round", inTempRange: true },
        ],
        warnings: [],
      },
      {
        site: { id: "dee-why-head", name: "Dee Why Head", status: "legal", restrictions: "No special restrictions" },
        rank: 6,
        diveScore: {
          overall: 5.5,
          label: "Fair",
          breakdown: { visibility: 6, conditionsFit: 5.5, safety: 5.5, comfort: 6.5 },
          topReasons: [],
          concerns: [],
        },
        conditionsFit: { swellOk: false, windIdeal: true, tideGood: true, overallFit: "fair" },
        topSpecies: [
          { name: "Snapper", regulation: "30cm min, bag 10", seasonRange: "Apr–Aug", inTempRange: true },
          { name: "Dusky Flathead", regulation: "36-70cm slot, bag 10", seasonRange: "Year-round", inTempRange: true },
          { name: "Silver Trevally", regulation: "No min size, bag 20", seasonRange: "Oct–Apr", inTempRange: true },
        ],
        warnings: [],
      },
      {
        site: { id: "north-head", name: "North Head (Manly)", status: "legal", restrictions: "No special restrictions" },
        rank: 7,
        diveScore: {
          overall: 4.5,
          label: "Marginal",
          breakdown: { visibility: 8, conditionsFit: 6.5, safety: 2, comfort: 4 },
          topReasons: ["Excellent vis (8.5m)"],
          concerns: ["Swell 1.2m exceeds site max 0.8m"],
        },
        conditionsFit: { swellOk: false, windIdeal: true, tideGood: false, overallFit: "poor" },
        topSpecies: [
          { name: "Yellowtail Kingfish", regulation: "65cm min, bag 5", seasonRange: "Oct–May", inTempRange: true },
          { name: "Cobia", regulation: "60cm min, bag 5", seasonRange: "Dec–Apr", inTempRange: true },
          { name: "Snapper", regulation: "30cm min, bag 10", seasonRange: "Apr–Aug", inTempRange: true },
        ],
        warnings: ["Swell 1.2m exceeds site max 0.8m"],
      },
    ],
    recommendation: {
      go: true,
      confidence: "high",
      summary: "Good conditions at Bluefish Point. Good vis (8.5m), 1.2m swell. Worth a dive.",
      bestSite: "Bluefish Point",
      bestTimeWindow: "Now is good — rising tide bringing clean water in",
      keyFactors: [
        "Vis: 8.5m (good)",
        "Swell: 1.2m @ 10s from SSE (holding)",
        "Wind: NW 8kt",
        "Tide: rising",
        "Rain: 5d since significant rain",
        "Best chances: Yellowtail Kingfish (65%), Silver Trevally (58%)",
      ],
    },
  };
}

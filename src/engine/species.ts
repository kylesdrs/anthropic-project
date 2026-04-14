/**
 * Fish species database and likelihood scoring.
 *
 * Calculates probability of encountering each target species based on
 * current conditions, site structure, and season.
 *
 * Scoring is grounded in real behaviour observed on Sydney's Northern
 * Beaches:
 *
 *   Season & temperature  — migration timing, spawning runs, EAC pulses
 *   Water clarity         — species-specific turbidity preference
 *                           (mulloway hunts dirty water; cobia needs 8m+)
 *   Current strength      — pelagics track bait through current; demersal
 *                           fish are largely indifferent
 *   Wind direction        — offshore wind cleans the water and pushes bait
 *                           against structure; critical for pelagics
 *   Swell & bait effect   — E/SE swell aggregates bait at headlands and
 *                           drop-offs, triggering feeding runs
 *   Post-rain conditions  — runoff destroys visibility for most species
 *                           but mulloway actively prefer turbid water
 *   EAC influence (SST)   — East Australian Current pulses warm clear water
 *                           south; SST ≥ 23 °C is the single strongest
 *                           predictor of pelagic activity in Sydney
 *   Time of day           — feeding windows vary widely per species
 *   Site structure        — habitat match to the species' preferred holding
 *   Depth                 — obvious but material (cobia won't be at 3m)
 */

export interface TargetSpecies {
  id: string;
  name: string;
  commonName: string;
  season: { peak: number[]; present: number[] }; // months 1-12
  tempRange: { min: number; max: number; ideal: number };
  currentPreference: "strong" | "moderate" | "light" | "any";
  visMinimum: number; // metres — below this, don't bother targeting
  depthRange: { min: number; max: number };
  timeOfDay: ("dawn" | "morning" | "midday" | "afternoon" | "dusk")[];
  structure: string[];
  nswBagLimit: number;
  nswMinSize: number; // cm
  notes: string;

  // --- Behaviour modifiers ---

  /**
   * Water clarity preference.
   *
   * clear    — pelagics that need to see and be seen (kingfish, bonito, cobia)
   * moderate — reef fish comfortable in 3-6m but prefer better (snapper, trevally)
   * dirty    — ambush predators that exploit turbidity (mulloway)
   * any      — indifferent (flathead)
   */
  waterClarityPreference: "clear" | "moderate" | "dirty" | "any";

  /**
   * EAC sensitivity. Species that track warm, clean EAC water southward.
   * When SST ≥ 23 °C the EAC is likely inshore — score a bonus.
   * When SST < 19 °C the EAC has retreated — score a penalty.
   */
  eacSensitivity: "high" | "moderate" | "low";

  /**
   * Offshore-wind response. Species that feed heavily when light offshore
   * wind cleans the surface and pushes bait against structure.
   */
  offshoreWindBonus: boolean;

  /**
   * Swell-bait aggregation. E/SE swell pushes pelagic bait schools against
   * headlands and drop-offs. Species that hunt bait benefit from this.
   * Demersal species that prefer settled reef are slightly hindered.
   */
  swellBaitEffect: "positive" | "negative" | "neutral";

  /**
   * Post-rain response.
   * positive — mulloway: turbid runoff is their cue to feed
   * negative — pelagics: dirty water = no vis = they move offshore
   * neutral  — demersal species not strongly affected
   */
  rainResponse: "positive" | "negative" | "neutral";
}

export interface SpeciesConditions {
  month: number;
  waterTemp: number;           // °C — measured or SST proxy
  seaSurfaceTemp: number | null; // °C — EAC indicator (higher = EAC pulse)
  estimatedVis: number;        // metres
  currentStrength: "none" | "light" | "moderate" | "strong";
  timeOfDay: "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk";
  siteStructure: string[];
  depth: number;               // metres (avg site depth)
  windDirection: string;       // 16-point compass e.g. "W", "NW", "ESE"
  windSpeed: number;           // knots (sustained)
  swellHeight: number;         // metres
  swellDirection: string;      // 8-point compass e.g. "SE", "S"
  rainfall24h: number;         // mm in last 24 hours
  daysSinceRain: number;       // days since significant rain (≥2mm)
}

export interface SpeciesLikelihood {
  score: number;       // 0-100
  reasoning: string;
}

export const targetSpecies: TargetSpecies[] = [
  {
    id: "kingfish",
    name: "Seriola lalandi",
    commonName: "Kingfish (Yellowtail)",
    season: {
      peak: [10, 11, 12, 1, 2, 3, 4, 5],
      present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    tempRange: { min: 18, max: 26, ideal: 22 },
    currentPreference: "moderate",
    visMinimum: 5,
    depthRange: { min: 5, max: 30 },
    timeOfDay: ["dawn", "morning", "afternoon", "dusk"],
    structure: [
      "headlands",
      "drop-offs",
      "bommies",
      "reef edges",
      "gutters",
    ],
    nswBagLimit: 5,
    nswMinSize: 65,
    notes:
      "The king of Sydney spearfishing. Year-round but best Oct-May when water is warmer and bait is inshore. Follow the current — no run, no fun. Around 1 knot is the sweet spot. Often patrol headlands and drop-offs at dawn and dusk. Will follow bait schools tight to the reef. If you can see yakkas, kings aren't far away.",
    waterClarityPreference: "clear",
    eacSensitivity: "high",
    offshoreWindBonus: true,
    swellBaitEffect: "positive",
    rainResponse: "negative",
  },
  {
    id: "bonito",
    name: "Sarda australis",
    commonName: "Bonito (Australian Bonito)",
    season: {
      peak: [11, 12, 1, 2, 3, 4],
      present: [10, 11, 12, 1, 2, 3, 4, 5],
    },
    tempRange: { min: 20, max: 27, ideal: 23 },
    currentPreference: "moderate",
    visMinimum: 5,
    depthRange: { min: 2, max: 20 },
    timeOfDay: ["dawn", "morning", "afternoon"],
    structure: ["reef edges", "open water", "drop-offs", "bommies"],
    nswBagLimit: 20,
    nswMinSize: 0,
    notes:
      "Fast-moving summer visitors. Often visible from the surface as boiling water when they're chasing bait. School up around reef edges and drop-offs. Need decent current and warm water (21 °C+). When bonito are on, they're usually thick — if you find one, there are more. Great eating if bled and iced immediately.",
    waterClarityPreference: "clear",
    eacSensitivity: "high",
    offshoreWindBonus: true,
    swellBaitEffect: "positive",
    rainResponse: "negative",
  },
  {
    id: "snapper",
    name: "Chrysophrys auratus",
    commonName: "Snapper",
    season: {
      peak: [4, 5, 6, 7, 8],
      present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    tempRange: { min: 15, max: 24, ideal: 19 },
    currentPreference: "light",
    visMinimum: 3,
    depthRange: { min: 5, max: 25 },
    timeOfDay: ["dawn", "dusk", "morning"],
    structure: [
      "reef edges",
      "gutters",
      "caves",
      "ledges",
      "bommies",
      "sand/reef interface",
    ],
    nswBagLimit: 10,
    nswMinSize: 30,
    notes:
      "Year-round resident but best April-August during the spawning run when big fish push inshore. Cautious and spook easily — low-light periods are best. Work the ledges, gutters, and caves. They sit tight to structure and will bolt at the first sign of trouble. Approach slow, stay low, and use reef features for concealment. The cooler months are snapper season.",
    waterClarityPreference: "moderate",
    eacSensitivity: "low",
    offshoreWindBonus: false,
    swellBaitEffect: "negative",
    rainResponse: "neutral",
  },
  {
    id: "cobia",
    name: "Rachycentron canadum",
    commonName: "Cobia",
    season: {
      peak: [12, 1, 2, 3, 4],
      present: [11, 12, 1, 2, 3, 4, 5],
    },
    tempRange: { min: 22, max: 28, ideal: 25 },
    currentPreference: "light",
    visMinimum: 8,
    depthRange: { min: 5, max: 30 },
    timeOfDay: ["morning", "midday", "afternoon"],
    structure: [
      "open sand near reef",
      "drop-offs",
      "bommies",
      "walls",
    ],
    nswBagLimit: 5,
    nswMinSize: 60,
    notes:
      "Summer visitor — one of the most exciting encounters in Sydney waters. Often found cruising with rays, turtles, or even sharks. Curious fish that will approach divers if you stay still. Look for them in open water near reef structure, especially at North Head and deeper headland sites. Need warm water (22 °C+) and good vis to find them.",
    waterClarityPreference: "clear",
    eacSensitivity: "high",
    offshoreWindBonus: false,
    swellBaitEffect: "neutral",
    rainResponse: "negative",
  },
  {
    id: "flathead",
    name: "Platycephalus fuscus",
    commonName: "Dusky Flathead",
    season: {
      peak: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    tempRange: { min: 14, max: 28, ideal: 20 },
    currentPreference: "any",
    visMinimum: 2,
    depthRange: { min: 1, max: 15 },
    timeOfDay: ["dawn", "morning", "midday", "afternoon", "dusk"],
    structure: [
      "sand/reef interface",
      "sand patches",
      "rubble",
      "sand gutters",
    ],
    nswBagLimit: 10,
    nswMinSize: 36,
    notes:
      "The reliable fallback — always around, in almost any conditions. Ambush predator that buries in sand adjacent to reef. Easier to target in lower vis than pelagics since they sit still. Work the sand patches between reef sections and the sand/reef interface. Often overlooked by spearos targeting pelagics but excellent eating.",
    waterClarityPreference: "any",
    eacSensitivity: "low",
    offshoreWindBonus: false,
    swellBaitEffect: "neutral",
    rainResponse: "neutral",
  },
  {
    id: "trevally",
    name: "Caranx spp.",
    commonName: "Trevally (various)",
    season: {
      peak: [10, 11, 12, 1, 2, 3, 4],
      present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    tempRange: { min: 17, max: 27, ideal: 22 },
    currentPreference: "moderate",
    visMinimum: 4,
    depthRange: { min: 3, max: 20 },
    timeOfDay: ["dawn", "morning", "afternoon", "dusk"],
    structure: ["reef edges", "gutters", "drop-offs", "bommies", "headlands"],
    nswBagLimit: 20,
    nswMinSize: 0,
    notes:
      "Aggressive reef predators — silver trevally and bluefin trevally are the common Sydney species. Often in schools, which means if you see one, dive down and there will be more. Feed hard around current and bait. Gutters and reef edges are prime spots. More active in warmer months but present year-round. Decent eating, especially silver trevally.",
    waterClarityPreference: "moderate",
    eacSensitivity: "moderate",
    offshoreWindBonus: true,
    swellBaitEffect: "positive",
    rainResponse: "negative",
  },
  {
    id: "mulloway",
    name: "Argyrosomus japonicus",
    commonName: "Mulloway (Jewfish)",
    season: {
      peak: [5, 6, 7, 8, 9],
      present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    tempRange: { min: 14, max: 24, ideal: 18 },
    currentPreference: "light",
    visMinimum: 1,
    depthRange: { min: 3, max: 25 },
    timeOfDay: ["dawn", "dusk"],
    structure: [
      "rock ledges",
      "deep gutters",
      "caves",
      "near river mouths",
      "sand/reef interface",
    ],
    nswBagLimit: 2,
    nswMinSize: 45,
    notes:
      "The low-vis specialist. Counterintuitively, mulloway prefer dirty water — they're ambush predators that use turbidity to their advantage. Best targeted at dawn or dusk in the cooler months around deep ledges and gutters. Often found near river mouths and estuary outflows where other species won't be. Winter is prime time. Very spooky — slow, quiet approaches only.",
    waterClarityPreference: "dirty",
    eacSensitivity: "low",
    offshoreWindBonus: false,
    swellBaitEffect: "neutral",
    rainResponse: "positive",
  },
];

// --- Helpers ---

const OFFSHORE_DIRECTIONS = new Set(["W", "WNW", "WSW", "NW", "NNW", "SW", "SSW"]);
const ONSHORE_DIRECTIONS = new Set(["E", "ENE", "ESE", "NE", "NNE", "SE", "SSE"]);

// E/SE swell pushes bait schools against Sydney headlands and reef edges.
// This is the swell direction window that aggregates bait on the Northern Beaches.
const BAIT_AGGREGATING_SWELL = new Set(["E", "SE", "NE", "ENE", "ESE", "NNE"]);

/**
 * Calculate how likely you are to encounter a species given current conditions.
 *
 * Returns a 0-100 score and a human-readable explanation of what's helping
 * and hurting your chances.
 */
export function calculateSpeciesLikelihood(
  species: TargetSpecies,
  conditions: SpeciesConditions
): SpeciesLikelihood {
  let score = 50; // start neutral
  const reasons: string[] = [];

  // --- Season (up to ±25) ---
  if (species.season.peak.includes(conditions.month)) {
    score += 25;
    reasons.push("Peak season — best time of year");
  } else if (species.season.present.includes(conditions.month)) {
    score += 5;
    reasons.push("In season but outside peak months");
  } else {
    score -= 25;
    reasons.push("Out of season — unlikely to encounter");
  }

  // --- EAC / Sea Surface Temperature (up to ±15) ---
  // The East Australian Current is the dominant factor for pelagic abundance
  // on the Northern Beaches. When the EAC pushes warm water inshore (SST ≥ 23 °C)
  // pelagic bait schools aggregate and predators follow. When the EAC retreats
  // (SST < 19 °C), pelagics move offshore or deeper.
  const sst = conditions.seaSurfaceTemp ?? conditions.waterTemp;
  if (species.eacSensitivity === "high") {
    if (sst >= 23) {
      score += 15;
      reasons.push(`SST ${sst}°C — EAC pushing warm bait-rich water inshore`);
    } else if (sst >= 21) {
      score += 7;
      reasons.push(`SST ${sst}°C — warm enough for this species`);
    } else if (sst < 19) {
      score -= 12;
      reasons.push(`SST ${sst}°C — too cold, EAC has retreated offshore`);
    }
  } else if (species.eacSensitivity === "moderate") {
    if (sst >= 23) {
      score += 8;
      reasons.push(`SST ${sst}°C — warm water helping conditions`);
    } else if (sst < 18) {
      score -= 5;
      reasons.push(`SST ${sst}°C — cooler than ideal`);
    }
  }
  // "low" EAC sensitivity species (snapper, flathead, mulloway) not affected

  // --- Water temperature (up to ±15) ---
  // Narrower range than EAC check — this is ambient water temp the fish feel
  const { min: tMin, max: tMax, ideal: tIdeal } = species.tempRange;
  const temp = conditions.waterTemp;

  if (temp < tMin || temp > tMax) {
    score -= 15;
    reasons.push(
      `Water temp ${temp}°C is outside range (${tMin}–${tMax}°C)`
    );
  } else {
    const distFromIdeal = Math.abs(temp - tIdeal);
    const halfRange = Math.max((tMax - tMin) / 2, 1);
    const tempScore = Math.round(15 * (1 - distFromIdeal / halfRange));
    score += Math.max(tempScore, -8);
    if (distFromIdeal <= 2) {
      reasons.push(`Water temp ${temp}°C is ideal (${tIdeal}°C)`);
    } else {
      reasons.push(
        `Water temp ${temp}°C is within range but not ideal (${tIdeal}°C)`
      );
    }
  }

  // --- Post-rain / water clarity preference (up to ±15) ---
  // Mulloway actively hunt in turbid runoff. Pelagics move offshore when
  // visibility collapses. This is separate from the visibility minimum check
  // — it scores the *desirability* of current water clarity for this species.
  const isRecentRain = conditions.rainfall24h >= 3 || conditions.daysSinceRain <= 1;
  const isDirtyWater = conditions.estimatedVis < 3;
  const isClearWater = conditions.estimatedVis >= 7;

  if (species.rainResponse === "positive") {
    // Mulloway: rain and turbidity are a feeding trigger
    if (isRecentRain && isDirtyWater) {
      score += 15;
      reasons.push("Rain runoff and turbid water — prime mulloway conditions");
    } else if (isRecentRain) {
      score += 8;
      reasons.push("Recent rain — increased turbidity favouring this species");
    } else if (isClearWater) {
      score -= 8;
      reasons.push("Clear water — this species prefers turbid conditions");
    }
  } else if (species.rainResponse === "negative") {
    if (isRecentRain && isDirtyWater) {
      score -= 12;
      reasons.push("Rain runoff has killed visibility — fish moved offshore");
    } else if (isRecentRain) {
      score -= 5;
      reasons.push("Recent rain reducing water clarity");
    } else if (conditions.daysSinceRain >= 5 && isClearWater) {
      score += 8;
      reasons.push(`${conditions.daysSinceRain} dry days — clean clear water, fish inshore`);
    } else if (conditions.daysSinceRain >= 3) {
      score += 4;
      reasons.push("Water clearing after dry spell");
    }
  }
  // "neutral" — no rain bonus/penalty applied here

  // --- Visibility minimum check (up to ±15) ---
  // Separate from clarity preference — this is a hard-floor check on whether
  // you can physically see and shoot this species.
  if (conditions.estimatedVis < species.visMinimum) {
    const deficit = species.visMinimum - conditions.estimatedVis;
    score -= Math.min(15, deficit * 5);
    reasons.push(
      `Vis ${conditions.estimatedVis}m is below minimum ${species.visMinimum}m for this species`
    );
  } else if (conditions.estimatedVis >= species.visMinimum * 2) {
    score += 8;
    reasons.push("Excellent visibility — good conditions to spot them");
  } else {
    score += 3;
    reasons.push("Visibility is adequate");
  }

  // --- Current strength (up to ±12) ---
  // Pelagics follow bait through current; demersal fish are less affected.
  // ~1 knot (moderate) is the sweet spot for Sydney kingfish and trevally.
  const currentMap: Record<string, number> = {
    none: 0,
    light: 1,
    moderate: 2,
    strong: 3,
  };
  const prefMap: Record<string, number> = {
    any: -1,
    light: 1,
    moderate: 2,
    strong: 3,
  };

  const currentVal = currentMap[conditions.currentStrength];
  const prefVal = prefMap[species.currentPreference];

  if (prefVal === -1) {
    score += 3;
    reasons.push("Current strength doesn't affect this species");
  } else {
    const currentDiff = Math.abs(currentVal - prefVal);
    if (currentDiff === 0) {
      score += 12;
      reasons.push(
        `${conditions.currentStrength} current is exactly what this species likes`
      );
    } else if (currentDiff === 1) {
      score += 4;
      reasons.push("Current is close to preferred strength");
    } else {
      score -= 8;
      reasons.push(
        `Prefers ${species.currentPreference} current, getting ${conditions.currentStrength}`
      );
    }
  }

  // --- Wind direction (up to ±10) ---
  // Offshore wind flattens the surface and pushes bait schools against reef
  // structure, concentrating them where pelagic predators expect to find them.
  // Onshore wind pushes turbid water onto the reef and disperses bait.
  if (species.offshoreWindBonus) {
    const isOffshore = OFFSHORE_DIRECTIONS.has(conditions.windDirection);
    const isOnshore = ONSHORE_DIRECTIONS.has(conditions.windDirection);
    if (isOffshore && conditions.windSpeed >= 5 && conditions.windSpeed <= 20) {
      score += 10;
      reasons.push(
        `${conditions.windDirection} offshore at ${conditions.windSpeed}kt — bait pushed against structure`
      );
    } else if (isOffshore) {
      score += 4;
      reasons.push(`Offshore ${conditions.windDirection} — decent conditions`);
    } else if (isOnshore && conditions.windSpeed >= 12) {
      score -= 8;
      reasons.push(
        `${conditions.windDirection} onshore at ${conditions.windSpeed}kt — dispersing bait, dirty water`
      );
    } else if (isOnshore) {
      score -= 3;
      reasons.push(`Onshore ${conditions.windDirection} — not ideal for this species`);
    }
  }

  // --- Swell & bait aggregation (up to ±10) ---
  // E/SE swell is the Northern Beaches pelagic trigger: it pushes bait schools
  // against headlands and drop-offs, holding them in place against the structure
  // and triggering feeding runs. The same swell disturbs demersal habitat.
  if (species.swellBaitEffect === "positive") {
    const isBaitAggregating = BAIT_AGGREGATING_SWELL.has(conditions.swellDirection);
    if (isBaitAggregating && conditions.swellHeight >= 0.5 && conditions.swellHeight <= 1.5) {
      score += 10;
      reasons.push(
        `${conditions.swellDirection} swell at ${conditions.swellHeight}m — bait aggregating at headlands`
      );
    } else if (isBaitAggregating) {
      score += 4;
      reasons.push(`${conditions.swellDirection} swell pushing bait against structure`);
    } else {
      score -= 3;
      reasons.push("Swell direction not pushing bait onto structure");
    }
  } else if (species.swellBaitEffect === "negative") {
    if (conditions.swellHeight >= 1.0) {
      score -= 5;
      reasons.push(`${conditions.swellHeight}m swell disturbing reef habitat`);
    }
  }

  // --- Time of day (up to ±10) ---
  if (conditions.timeOfDay === "night") {
    score -= 30;
    reasons.push("Night — too dark to see or target any species");
  } else if (species.timeOfDay.includes(conditions.timeOfDay)) {
    score += 10;
    reasons.push(`${conditions.timeOfDay} is a prime feeding window for this species`);
  } else {
    score -= 8;
    reasons.push(
      `${conditions.timeOfDay} is not ideal — best at ${species.timeOfDay.join(", ")}`
    );
  }

  // --- Structure match (up to ±8) ---
  const structureOverlap = species.structure.filter((s) =>
    conditions.siteStructure.some(
      (ss) =>
        ss.toLowerCase().includes(s.toLowerCase()) ||
        s.toLowerCase().includes(ss.toLowerCase())
    )
  );

  if (structureOverlap.length >= 2) {
    score += 8;
    reasons.push(
      `Site structure matches well (${structureOverlap.join(", ")})`
    );
  } else if (structureOverlap.length === 1) {
    score += 3;
    reasons.push(`Some structure match (${structureOverlap[0]})`);
  } else {
    score -= 8;
    reasons.push("Site structure doesn't match this species' preferred habitat");
  }

  // --- Depth (up to ±5) ---
  if (
    conditions.depth >= species.depthRange.min &&
    conditions.depth <= species.depthRange.max
  ) {
    score += 5;
    reasons.push("Depth is within range");
  } else {
    score -= 5;
    reasons.push(
      `Depth ${conditions.depth}m is outside preferred ${species.depthRange.min}–${species.depthRange.max}m`
    );
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasoning: reasons.join(". ") + ".",
  };
}

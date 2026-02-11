/**
 * Fish species database and likelihood scoring.
 *
 * Calculates probability of encountering each target species
 * based on current conditions, site structure, and season.
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
}

export interface SpeciesConditions {
  month: number;
  waterTemp: number;
  estimatedVis: number;
  currentStrength: "none" | "light" | "moderate" | "strong";
  timeOfDay: "dawn" | "morning" | "midday" | "afternoon" | "dusk";
  siteStructure: string[];
  depth: number;
}

export interface SpeciesLikelihood {
  score: number; // 0-100
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
    nswMinSize: 0, // no minimum size
    notes:
      "Fast-moving summer visitors. Often visible from the surface as boiling water when they're chasing bait. School up around reef edges and drop-offs. Need decent current and warm water (21°C+). When bonito are on, they're usually thick — if you find one, there are more. Great eating if bled and iced immediately.",
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
      "Summer visitor — one of the most exciting encounters in Sydney waters. Often found cruising with rays, turtles, or even sharks. Curious fish that will approach divers if you stay still. Look for them in open water near reef structure, especially at North Head and deeper headland sites. Need warm water (22°C+) and good vis to find them.",
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
    nswMinSize: 36, // 36cm dusky flathead in Sydney
    notes:
      "The reliable fallback — always around, in almost any conditions. Ambush predator that buries in sand adjacent to reef. Easier to target in lower vis than pelagics since they sit still. Work the sand patches between reef sections and the sand/reef interface. Often overlooked by spearo targeting pelagics but excellent eating.",
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
    nswMinSize: 0, // varies by species, no general minimum for most
    notes:
      "Aggressive reef predators — silver trevally and bluefin trevally are the common Sydney species. Often in schools, which means if you see one, dive down and there will be more. Feed hard around current and bait. Gutters and reef edges are prime spots. More active in warmer months but present year-round. Decent eating, especially silver trevally.",
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
  },
];

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

  // --- Water temperature (up to ±20) ---
  const { min: tMin, max: tMax, ideal: tIdeal } = species.tempRange;
  const temp = conditions.waterTemp;

  if (temp < tMin || temp > tMax) {
    score -= 20;
    reasons.push(
      `Water temp ${temp}°C is outside range (${tMin}-${tMax}°C)`
    );
  } else {
    const distFromIdeal = Math.abs(temp - tIdeal);
    const tempRange = Math.max(tMax - tMin, 1);
    const tempScore = Math.round(20 * (1 - distFromIdeal / (tempRange / 2)));
    score += Math.max(tempScore, -10);
    if (distFromIdeal <= 2) {
      reasons.push(`Water temp ${temp}°C is ideal (${tIdeal}°C)`);
    } else {
      reasons.push(
        `Water temp ${temp}°C is within range but not ideal (${tIdeal}°C)`
      );
    }
  }

  // --- Visibility (up to ±15) ---
  if (conditions.estimatedVis < species.visMinimum) {
    const deficit = species.visMinimum - conditions.estimatedVis;
    score -= Math.min(15, deficit * 5);
    reasons.push(
      `Vis ${conditions.estimatedVis}m is below minimum ${species.visMinimum}m for this species`
    );
  } else if (conditions.estimatedVis >= species.visMinimum * 2) {
    score += 10;
    reasons.push("Excellent visibility — good conditions to spot them");
  } else {
    score += 5;
    reasons.push("Visibility is adequate");
  }

  // --- Current (up to ±15) ---
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
    // species doesn't care about current
    score += 5;
    reasons.push("Current strength doesn't matter for this species");
  } else {
    const currentDiff = Math.abs(currentVal - prefVal);
    if (currentDiff === 0) {
      score += 15;
      reasons.push(
        `${conditions.currentStrength} current is exactly what this species likes`
      );
    } else if (currentDiff === 1) {
      score += 5;
      reasons.push("Current is close to preferred strength");
    } else {
      score -= 10;
      reasons.push(
        `Prefers ${species.currentPreference} current, getting ${conditions.currentStrength}`
      );
    }
  }

  // --- Time of day (up to ±10) ---
  if (species.timeOfDay.includes(conditions.timeOfDay)) {
    score += 10;
    reasons.push(`${conditions.timeOfDay} is a good time for this species`);
  } else {
    score -= 10;
    reasons.push(
      `${conditions.timeOfDay} is not ideal — prefer ${species.timeOfDay.join(", ")}`
    );
  }

  // --- Structure match (up to ±10) ---
  const structureOverlap = species.structure.filter((s) =>
    conditions.siteStructure.some(
      (ss) => ss.toLowerCase().includes(s.toLowerCase()) ||
              s.toLowerCase().includes(ss.toLowerCase())
    )
  );

  if (structureOverlap.length >= 2) {
    score += 10;
    reasons.push(
      `Site structure matches well (${structureOverlap.join(", ")})`
    );
  } else if (structureOverlap.length === 1) {
    score += 3;
    reasons.push(`Some structure match (${structureOverlap[0]})`);
  } else {
    score -= 10;
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
      `Depth ${conditions.depth}m is outside preferred ${species.depthRange.min}-${species.depthRange.max}m`
    );
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasoning: reasons.join(". ") + ".",
  };
}

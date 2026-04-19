/**
 * NSW DPI fisheries regulations.
 *
 * Bag limits, size limits, seasonal closures, and aquatic reserve rules
 * relevant to spearfishing on the Northern Beaches.
 *
 * Source: NSW DPI Recreational Fishing Guide
 * https://www.dpi.nsw.gov.au/fishing/recreational/fishing-rules-and-regs
 *
 * Last updated: February 2026
 */

// --- Types ---

export interface FishRegulation {
  speciesId: string;
  commonName: string;
  scientificName: string;
  minSizeCm: number; // 0 = no minimum
  maxSizeCm: number | null; // null = no maximum (slot limits use this)
  bagLimit: number;
  possessionLimit: number;
  closedSeason: ClosedSeason | null;
  notes: string;
}

export interface ClosedSeason {
  from: { month: number; day: number }; // 1-indexed
  to: { month: number; day: number };
  reason: string;
}

export interface AquaticReserve {
  id: string;
  name: string;
  spearfishingAllowed: boolean;
  restrictions: string;
  coordinates: { lat: number; lng: number }[];
}

// --- Regulations ---

export const fishRegulations: FishRegulation[] = [
  {
    speciesId: "kingfish",
    commonName: "Yellowtail Kingfish",
    scientificName: "Seriola lalandi",
    minSizeCm: 65,
    maxSizeCm: null,
    bagLimit: 5,
    possessionLimit: 10,
    closedSeason: null,
    notes:
      "Must be 65cm or larger. No closed season in NSW. One of the most regulated pelagics — know the size limit.",
  },
  {
    speciesId: "bonito",
    commonName: "Australian Bonito",
    scientificName: "Sarda australis",
    minSizeCm: 0,
    maxSizeCm: null,
    bagLimit: 20,
    possessionLimit: 40,
    closedSeason: null,
    notes:
      "No minimum size. Generous bag limit. Bleed and ice immediately for best eating.",
  },
  {
    speciesId: "snapper",
    commonName: "Snapper",
    scientificName: "Chrysophrys auratus",
    minSizeCm: 30,
    maxSizeCm: null,
    bagLimit: 10,
    possessionLimit: 20,
    closedSeason: null,
    notes:
      "30cm minimum. Bag limit reduced from previous years. Spawning aggregations in autumn/winter should be treated with respect.",
  },
  {
    speciesId: "cobia",
    commonName: "Cobia",
    scientificName: "Rachycentron canadum",
    minSizeCm: 60,
    maxSizeCm: null,
    bagLimit: 5,
    possessionLimit: 10,
    closedSeason: null,
    notes:
      "60cm minimum. Relatively uncommon in Sydney — consider releasing smaller fish even if legal.",
  },
  {
    speciesId: "flathead",
    commonName: "Dusky Flathead",
    scientificName: "Platycephalus fuscus",
    minSizeCm: 36,
    maxSizeCm: 70,
    bagLimit: 10,
    possessionLimit: 20,
    closedSeason: null,
    notes:
      "Slot limit: must be between 36-70cm. Fish over 70cm are breeding females and must be released. This is important for the population.",
  },
  {
    speciesId: "trevally",
    commonName: "Silver Trevally",
    scientificName: "Pseudocaranx georgianus",
    minSizeCm: 0,
    maxSizeCm: null,
    bagLimit: 20,
    possessionLimit: 40,
    closedSeason: null,
    notes:
      "No minimum size for silver trevally. Other trevally species may have different limits — check before keeping.",
  },
  {
    speciesId: "mulloway",
    commonName: "Mulloway (Jewfish)",
    scientificName: "Argyrosomus japonicus",
    minSizeCm: 45,
    maxSizeCm: null,
    bagLimit: 2,
    possessionLimit: 4,
    closedSeason: null,
    notes:
      "45cm minimum. Very low bag limit (2) — this species is under pressure. Only take what you need. Large specimens are valuable breeders.",
  },
];

// --- Aquatic Reserves ---

export const aquaticReserves: AquaticReserve[] = [
  {
    id: "cabbage-tree-bay",
    name: "Cabbage Tree Bay Aquatic Reserve",
    spearfishingAllowed: false,
    restrictions:
      "No-take zone. No fishing of any kind, including spearfishing. Extends from Shelly Beach to the eastern side of the headland. The boundary is marked by signs on shore.",
    coordinates: [
      { lat: -33.8, lng: 151.286 },
      { lat: -33.8, lng: 151.293 },
      { lat: -33.797, lng: 151.293 },
      { lat: -33.797, lng: 151.286 },
    ],
  },
  {
    id: "long-reef",
    name: "Long Reef Aquatic Reserve",
    spearfishingAllowed: true,
    restrictions:
      "Spearfishing for finfish is permitted. Collecting invertebrates, shellfish, or bait is prohibited. Hand gathering is not allowed.",
    coordinates: [
      { lat: -33.737, lng: 151.318 },
      { lat: -33.737, lng: 151.327 },
      { lat: -33.745, lng: 151.327 },
      { lat: -33.745, lng: 151.318 },
    ],
  },
  {
    id: "narrabeen-head",
    name: "Narrabeen Head Aquatic Reserve",
    spearfishingAllowed: true,
    restrictions:
      "Spearfishing for finfish is permitted. Collecting invertebrates is prohibited.",
    coordinates: [
      { lat: -33.707, lng: 151.311 },
      { lat: -33.707, lng: 151.318 },
      { lat: -33.713, lng: 151.318 },
      { lat: -33.713, lng: 151.311 },
    ],
  },
];

// --- Lookup functions ---

/**
 * Get regulations for a specific species.
 */
export function getRegulation(speciesId: string): FishRegulation | null {
  return fishRegulations.find((r) => r.speciesId === speciesId) ?? null;
}

/**
 * Check if a catch is legal.
 */
export function isCatchLegal(
  speciesId: string,
  sizeCm: number,
  currentCount: number
): { legal: boolean; reason: string } {
  const reg = getRegulation(speciesId);
  if (!reg) return { legal: true, reason: "No specific regulations found" };

  if (reg.minSizeCm > 0 && sizeCm < reg.minSizeCm) {
    return {
      legal: false,
      reason: `Under minimum size: ${sizeCm}cm < ${reg.minSizeCm}cm minimum`,
    };
  }

  if (reg.maxSizeCm !== null && sizeCm > reg.maxSizeCm) {
    return {
      legal: false,
      reason: `Over maximum size: ${sizeCm}cm > ${reg.maxSizeCm}cm maximum (slot limit)`,
    };
  }

  if (currentCount >= reg.bagLimit) {
    return {
      legal: false,
      reason: `Bag limit reached: ${currentCount}/${reg.bagLimit}`,
    };
  }

  // Check closed season
  if (reg.closedSeason) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const { from, to } = reg.closedSeason;

    let inClosedSeason = false;
    if (from.month <= to.month) {
      // Simple range (e.g., May to August)
      inClosedSeason =
        (currentMonth > from.month ||
          (currentMonth === from.month && currentDay >= from.day)) &&
        (currentMonth < to.month ||
          (currentMonth === to.month && currentDay <= to.day));
    } else {
      // Wraps around year (e.g., November to February)
      inClosedSeason =
        currentMonth > from.month ||
        (currentMonth === from.month && currentDay >= from.day) ||
        currentMonth < to.month ||
        (currentMonth === to.month && currentDay <= to.day);
    }

    if (inClosedSeason) {
      return {
        legal: false,
        reason: `Closed season: ${reg.closedSeason.reason}`,
      };
    }
  }

  return { legal: true, reason: "Within all limits" };
}

/**
 * Get the reserve rules for a site location.
 */
export function getReserveForLocation(
  lat: number,
  lng: number
): AquaticReserve | null {
  for (const reserve of aquaticReserves) {
    // Simple bounding box check
    const lats = reserve.coordinates.map((c) => c.lat);
    const lngs = reserve.coordinates.map((c) => c.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return reserve;
    }
  }
  return null;
}

/**
 * Format regulations as a human-readable string for a species.
 */
export function formatRegulation(speciesId: string): string {
  const reg = getRegulation(speciesId);
  if (!reg) return "No specific regulations found.";

  const parts: string[] = [];

  if (reg.minSizeCm > 0) {
    parts.push(`Min size: ${reg.minSizeCm}cm`);
  }
  if (reg.maxSizeCm !== null) {
    parts.push(`Max size: ${reg.maxSizeCm}cm`);
  }
  parts.push(`Bag limit: ${reg.bagLimit}`);

  if (reg.closedSeason) {
    parts.push(`Closed: ${reg.closedSeason.reason}`);
  }

  return `${reg.commonName}: ${parts.join(" | ")}`;
}

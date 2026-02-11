/**
 * Northern Beaches dive site database.
 *
 * Typed array of dive sites with full metadata:
 * location, legal status, depth, structure, conditions,
 * target species, parking, and hazards.
 */

export interface DiveSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "legal" | "no-take" | "restricted";
  restrictions: string;
  depthRange: { min: number; max: number };
  structure: string[];
  bestConditions: {
    swellMax: number;
    swellDirectionProtected: string[];
    windDirectionIdeal: string[];
    tidePreference: "rising" | "high" | "any";
  };
  exposure: string[];
  targetSpecies: string[];
  parkingNotes: string;
  entryPoints: { lat: number; lng: number; description: string }[];
  hazards: string[];
  notes: string;
}

export const northernBeachesSites: DiveSite[] = [
  {
    id: "fairy-bower",
    name: "Fairy Bower / The Bower",
    lat: -33.7983,
    lng: 151.2889,
    status: "no-take",
    restrictions:
      "Inside Cabbage Tree Bay Aquatic Reserve — all fishing and spearfishing prohibited. Observation and snorkelling only.",
    depthRange: { min: 1, max: 10 },
    structure: ["reef platform", "boulders", "kelp beds", "sand patches"],
    bestConditions: {
      swellMax: 1.5,
      swellDirectionProtected: ["S", "SW", "W"],
      windDirectionIdeal: ["W", "SW", "NW"],
      tidePreference: "any",
    },
    exposure: ["E", "NE"],
    targetSpecies: [],
    parkingNotes:
      "Street parking along Bower Lane or Fairy Bower Road. Can fill up quickly on weekends.",
    entryPoints: [
      {
        lat: -33.7981,
        lng: 151.289,
        description: "Rock platform entry at Fairy Bower Pool — easy entry in calm conditions",
      },
    ],
    hazards: ["Slippery rocks on entry", "Strong surge in swell over 1.5m"],
    notes:
      "NO SPEARFISHING — Cabbage Tree Bay Aquatic Reserve. Included as a reference site only. Excellent snorkelling with abundant marine life due to protection. Blue groper are resident and very approachable.",
  },
  {
    id: "freshwater-headland",
    name: "Freshwater Headland (Queenscliff End)",
    lat: -33.7812,
    lng: 151.2952,
    status: "legal",
    restrictions: "Outside Cabbage Tree Bay reserve — spearfishing permitted.",
    depthRange: { min: 5, max: 15 },
    structure: ["reef drop-offs", "boulders", "gutters", "sand/reef interface"],
    bestConditions: {
      swellMax: 1.0,
      swellDirectionProtected: ["S", "SW"],
      windDirectionIdeal: ["W", "SW", "NW"],
      tidePreference: "rising",
    },
    exposure: ["SE", "E"],
    targetSpecies: ["Kingfish", "Trevally", "Bonito", "Snapper"],
    parkingNotes:
      "Queenscliff car park off Greycliffe Street. Free but limited spots — arrive early on weekends.",
    entryPoints: [
      {
        lat: -33.7815,
        lng: 151.2948,
        description: "Rock platform entry on the Queenscliff side — check swell before committing",
      },
      {
        lat: -33.7808,
        lng: 151.2955,
        description: "Northern entry off headland rocks — easier in smaller swell",
      },
    ],
    hazards: [
      "Exposed rock entry in swell",
      "Strong sweep around headland on bigger days",
      "Close proximity to Cabbage Tree Bay reserve boundary — know the line",
    ],
    notes:
      "Good all-rounder when swell is small. Kingfish and bonito show up when current is running along the headland. Sits right on the edge of the Cabbage Tree Bay reserve — stay on the Queenscliff side.",
  },
  {
    id: "long-reef",
    name: "Long Reef",
    lat: -33.7404,
    lng: 151.3216,
    status: "restricted",
    restrictions:
      "Long Reef Aquatic Reserve — spearfishing permitted for finfish only. You must bring your own bait; collecting bait, invertebrates, or shellfish is prohibited.",
    depthRange: { min: 3, max: 15 },
    structure: [
      "extensive reef platform",
      "drop-offs",
      "gutters",
      "bommies",
      "sand channels",
    ],
    bestConditions: {
      swellMax: 1.0,
      swellDirectionProtected: ["S", "SW"],
      windDirectionIdeal: ["NW", "W"],
      tidePreference: "high",
    },
    exposure: ["E", "NE"],
    targetSpecies: ["Kingfish", "Bonito", "Trevally", "Snapper"],
    parkingNotes:
      "Long Reef car park off Anzac Avenue. Fills very early on weekends, especially in summer. Golf club overflow is sometimes available.",
    entryPoints: [
      {
        lat: -33.7395,
        lng: 151.3225,
        description: "Northern end drop-off — walk across reef platform at high tide",
      },
      {
        lat: -33.7415,
        lng: 151.321,
        description: "Southern end near the golf course — shorter walk, shallower reef",
      },
    ],
    hazards: [
      "Very exposed to E-NE swell — can go from calm to dangerous quickly",
      "Long walk across reef platform — difficult to exit quickly if conditions change",
      "Reef platform is extremely slippery",
      "Strong currents on outgoing tide at drop-off edges",
    ],
    notes:
      "One of Sydney's most productive spearfishing spots when conditions align. The northern and southern drop-offs hold kingfish when current is pushing. Needs high tide to access the platform comfortably. Very exposed — don't go if swell is building. Site of fatal shark attack in September 2025.",
  },
  {
    id: "narrabeen-head",
    name: "Narrabeen Head",
    lat: -33.7097,
    lng: 151.3143,
    status: "restricted",
    restrictions:
      "Narrabeen Head Aquatic Reserve — spearfishing permitted for finfish.",
    depthRange: { min: 5, max: 20 },
    structure: ["rocky reef", "ledges", "drop-offs", "sand gutters", "bommies"],
    bestConditions: {
      swellMax: 1.5,
      swellDirectionProtected: ["N", "NE"],
      windDirectionIdeal: ["W", "NW", "SW"],
      tidePreference: "rising",
    },
    exposure: ["S", "SE"],
    targetSpecies: ["Snapper", "Kingfish", "Flathead", "Trevally"],
    parkingNotes:
      "Street parking on Ocean Street or Narrabeen Head car park. More relaxed than Long Reef.",
    entryPoints: [
      {
        lat: -33.7102,
        lng: 151.3148,
        description: "Southern rock shelf entry — moderate difficulty, watch for surge",
      },
      {
        lat: -33.7089,
        lng: 151.314,
        description: "Northern entry via rock scramble — steeper but shorter swim to deep water",
      },
    ],
    hazards: [
      "Strong surge on southern side in S-SE swell",
      "Ledges and overhangs can disorient in low vis",
      "Current can push around headland unexpectedly",
    ],
    notes:
      "Underrated spot that fishes well when the south-facing sites are blown out by northerly swell. Good snapper country in the ledges, especially in the cooler months. The drop-offs on the northern side hold kingfish when current is running south.",
  },
  {
    id: "north-head",
    name: "North Head (Manly)",
    lat: -33.8155,
    lng: 151.2975,
    status: "legal",
    restrictions: "No special restrictions — spearfishing permitted.",
    depthRange: { min: 10, max: 30 },
    structure: [
      "dramatic walls",
      "caves",
      "deep drop-offs",
      "bommies",
      "boulder fields",
    ],
    bestConditions: {
      swellMax: 0.8,
      swellDirectionProtected: [],
      windDirectionIdeal: ["W", "NW", "SW"],
      tidePreference: "high",
    },
    exposure: ["N", "NE", "E", "SE", "S"],
    targetSpecies: ["Kingfish", "Cobia", "Snapper", "Trevally", "Bonito"],
    parkingNotes:
      "North Head Scenic Drive car park inside Sydney Harbour National Park. May require national park entry fee. Limited spots.",
    entryPoints: [
      {
        lat: -33.8148,
        lng: 151.298,
        description:
          "Eastern cliff entry — advanced only, must assess conditions carefully. Long climb back up.",
      },
    ],
    hazards: [
      "Exposed to almost all swell directions — needs very calm days",
      "Strong currents possible, especially around the headland",
      "Deep water close to shore — easy to exceed comfortable depth",
      "Difficult exit — steep cliff scramble",
      "Heavy boat traffic in harbour approach",
    ],
    notes:
      "Advanced site with serious big-fish potential. The walls drop into deep blue water and attract large pelagics including cobia and kingfish. Only diveable on very calm days — exposed to nearly everything. Strong currents are common. Not a site for beginners. Check conditions thoroughly before committing.",
  },
  {
    id: "curl-curl-headland",
    name: "Curl Curl Headland",
    lat: -33.7685,
    lng: 151.2981,
    status: "legal",
    restrictions: "No special restrictions — spearfishing permitted.",
    depthRange: { min: 5, max: 12 },
    structure: ["boulder reef", "gutters", "sand patches", "low-profile reef"],
    bestConditions: {
      swellMax: 1.0,
      swellDirectionProtected: ["S", "SW"],
      windDirectionIdeal: ["W", "NW", "SW"],
      tidePreference: "rising",
    },
    exposure: ["E", "NE", "SE"],
    targetSpecies: ["Trevally", "Snapper", "Drummer", "Flathead"],
    parkingNotes:
      "Street parking on Carrington Parade. Usually available midweek, competitive on weekends.",
    entryPoints: [
      {
        lat: -33.7688,
        lng: 151.2985,
        description: "Rock platform entry on the southern side of the headland — easy in calm conditions",
      },
    ],
    hazards: [
      "Exposed rock entry can be dangerous in anything over 1m swell",
      "Shallow reef — watch for surge pushing you into rocks",
      "Sweep current along headland in bigger conditions",
    ],
    notes:
      "Good beginner-to-intermediate spot with accessible depths. The gutters hold trevally and snapper, and the sandy patches adjacent to reef are productive for flathead. Less crowded than Long Reef or Freshwater.",
  },
  {
    id: "dee-why-head",
    name: "Dee Why Head",
    lat: -33.7495,
    lng: 151.3098,
    status: "legal",
    restrictions: "No special restrictions — spearfishing permitted.",
    depthRange: { min: 5, max: 15 },
    structure: [
      "reef ledges",
      "sand/reef interface",
      "gutters",
      "low bommies",
    ],
    bestConditions: {
      swellMax: 1.0,
      swellDirectionProtected: ["S", "SW"],
      windDirectionIdeal: ["W", "NW"],
      tidePreference: "rising",
    },
    exposure: ["E", "NE", "SE"],
    targetSpecies: ["Snapper", "Flathead", "Trevally", "Drummer"],
    parkingNotes:
      "Dee Why Beach car park or street parking on The Strand. Metered in peak periods.",
    entryPoints: [
      {
        lat: -33.7498,
        lng: 151.3102,
        description: "Rock shelf entry on the northern face — moderate difficulty",
      },
      {
        lat: -33.7488,
        lng: 151.3095,
        description: "Beach entry from Dee Why and swim around — longer but easier",
      },
    ],
    hazards: [
      "Rocky entry exposed to NE swell",
      "Shallow reef close to shore — surge risk",
      "Proximity to Dee Why lagoon outflow can bring dirty water after rain",
    ],
    notes:
      "Solid mid-range spot between Long Reef and Curl Curl. The reef ledges on the northern side are good snapper habitat, especially in cooler months. The sand/reef interface produces flathead year-round. Vis is more affected by rain than some other spots due to the Dee Why Lagoon outflow nearby.",
  },
];

/**
 * SharkSmart alert aggregation.
 *
 * SharkSmart (sharksmart.nsw.gov.au) doesn't have a public API,
 * so this module provides:
 * 1. A typed alert system for manual data entry from the SharkSmart app
 * 2. Static data on listening stations and SMART drumline locations
 * 3. Functions to query and filter alerts by location/time
 *
 * In production, this would be supplemented by scraping or an
 * API partnership. For now, alerts are stored in a local JSON file.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

// --- Types ---

export interface SharkAlert {
  id: string;
  date: string; // ISO date string
  type:
    | "tagged_detection"
    | "aerial_sighting"
    | "drumline_catch"
    | "drone_sighting"
    | "incident"
    | "community_report";
  species: "white" | "bull" | "tiger" | "hammerhead" | "unknown";
  location: {
    lat: number;
    lng: number;
    beach: string;
  };
  details: string;
}

export interface ListeningStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  active: boolean;
}

export interface DrumlineLocation {
  id: string;
  beach: string;
  lat: number;
  lng: number;
  active: boolean;
}

// --- Static data: Northern Beaches shark infrastructure ---

export const listeningStations: ListeningStation[] = [
  {
    id: "ls-long-reef",
    name: "Long Reef VR2W",
    lat: -33.7404,
    lng: 151.3235,
    active: true,
  },
  {
    id: "ls-manly",
    name: "Manly VR2W",
    lat: -33.7983,
    lng: 151.2905,
    active: true,
  },
  {
    id: "ls-narrabeen",
    name: "Narrabeen VR2W",
    lat: -33.7097,
    lng: 151.316,
    active: true,
  },
  {
    id: "ls-dee-why",
    name: "Dee Why VR2W",
    lat: -33.7495,
    lng: 151.312,
    active: true,
  },
];

export const drumlineLocations: DrumlineLocation[] = [
  {
    id: "dl-long-reef-n",
    beach: "Long Reef North",
    lat: -33.737,
    lng: 151.3245,
    active: true,
  },
  {
    id: "dl-long-reef-s",
    beach: "Long Reef South",
    lat: -33.743,
    lng: 151.319,
    active: true,
  },
  {
    id: "dl-dee-why",
    beach: "Dee Why",
    lat: -33.751,
    lng: 151.311,
    active: true,
  },
  {
    id: "dl-narrabeen",
    beach: "Narrabeen",
    lat: -33.712,
    lng: 151.316,
    active: true,
  },
  {
    id: "dl-manly",
    beach: "Manly",
    lat: -33.793,
    lng: 151.291,
    active: true,
  },
  {
    id: "dl-freshwater",
    beach: "Freshwater",
    lat: -33.776,
    lng: 151.297,
    active: true,
  },
];

// --- Alert storage ---

const ALERTS_FILE = path.join(
  process.cwd(),
  "data",
  "shark_alerts.json"
);

function loadAlerts(): SharkAlert[] {
  if (!existsSync(ALERTS_FILE)) return [];

  try {
    const raw = readFileSync(ALERTS_FILE, "utf-8");
    return JSON.parse(raw) as SharkAlert[];
  } catch {
    return [];
  }
}

function saveAlerts(alerts: SharkAlert[]): void {
  writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2), "utf-8");
}

// --- Helpers ---

/**
 * Haversine distance between two lat/lng points in kilometres.
 */
function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Public API ---

/**
 * Get recent shark alerts near a location.
 */
export function getRecentSharkActivity(
  lat: number,
  lng: number,
  radiusKm: number = 10,
  daysBack: number = 7
): SharkAlert[] {
  const alerts = loadAlerts();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffMs = cutoff.getTime();

  return alerts.filter((alert) => {
    const alertDate = new Date(alert.date).getTime();
    if (alertDate < cutoffMs) return false;

    const dist = distanceKm(lat, lng, alert.location.lat, alert.location.lng);
    return dist <= radiusKm;
  });
}

/**
 * Get all alerts for a specific beach.
 */
export function getAlertsForBeach(
  beach: string,
  daysBack: number = 30
): SharkAlert[] {
  const alerts = loadAlerts();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffMs = cutoff.getTime();

  return alerts.filter((alert) => {
    const alertDate = new Date(alert.date).getTime();
    if (alertDate < cutoffMs) return false;

    return alert.location.beach.toLowerCase().includes(beach.toLowerCase());
  });
}

/**
 * Add a new shark alert (manual entry from SharkSmart app).
 */
export function addSharkAlert(alert: Omit<SharkAlert, "id">): SharkAlert {
  const alerts = loadAlerts();
  const newAlert: SharkAlert = {
    ...alert,
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  alerts.push(newAlert);
  saveAlerts(alerts);
  return newAlert;
}

/**
 * Get days since last shark incident (any type) near a location.
 */
export function daysSinceLastIncident(
  lat: number,
  lng: number,
  radiusKm: number = 15
): number | null {
  const alerts = loadAlerts();

  let mostRecent: number | null = null;
  for (const alert of alerts) {
    const dist = distanceKm(lat, lng, alert.location.lat, alert.location.lng);
    if (dist > radiusKm) continue;

    const alertMs = new Date(alert.date).getTime();
    if (mostRecent === null || alertMs > mostRecent) {
      mostRecent = alertMs;
    }
  }

  if (mostRecent === null) return null;
  return Math.floor((Date.now() - mostRecent) / (1000 * 60 * 60 * 24));
}

/**
 * Get the nearest listening station to a point.
 */
export function nearestListeningStation(
  lat: number,
  lng: number
): { station: ListeningStation; distanceKm: number } {
  let nearest = listeningStations[0];
  let minDist = Infinity;

  for (const station of listeningStations) {
    if (!station.active) continue;
    const dist = distanceKm(lat, lng, station.lat, station.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  }

  return { station: nearest, distanceKm: Math.round(minDist * 10) / 10 };
}

/**
 * Get SMART drumlines near a location.
 */
export function nearbyDrumlines(
  lat: number,
  lng: number,
  radiusKm: number = 5
): DrumlineLocation[] {
  return drumlineLocations.filter((dl) => {
    if (!dl.active) return false;
    return distanceKm(lat, lng, dl.lat, dl.lng) <= radiusKm;
  });
}

/**
 * Simple file-based caching layer.
 *
 * Avoids hammering external APIs by caching responses to /tmp
 * with a configurable TTL per data source.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const CACHE_DIR = "/tmp/spearfishing-cache";

interface CacheEntry<T> {
  data: T;
  cachedAt: number; // epoch ms
  ttlMs: number;
}

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheFilePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

/**
 * Get a value from cache if it exists and hasn't expired.
 */
export function getCached<T>(key: string): T | null {
  const filePath = cacheFilePath(key);
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.cachedAt;

    if (age > entry.ttlMs) {
      return null; // expired
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Write a value to cache with a given TTL.
 */
export function setCache<T>(key: string, data: T, ttlMs: number): void {
  ensureCacheDir();
  const filePath = cacheFilePath(key);
  const entry: CacheEntry<T> = {
    data,
    cachedAt: Date.now(),
    ttlMs,
  };
  writeFileSync(filePath, JSON.stringify(entry), "utf-8");
}

/**
 * Fetch with cache — tries cache first, falls back to fetcher function.
 */
export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  const data = await fetcher();
  setCache(key, data, ttlMs);
  return data;
}

/** Common TTL values */
export const TTL = {
  THIRTY_MINUTES: 30 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  THREE_HOURS: 3 * 60 * 60 * 1000,
  SIX_HOURS: 6 * 60 * 60 * 1000,
  TWELVE_HOURS: 12 * 60 * 60 * 1000,
} as const;

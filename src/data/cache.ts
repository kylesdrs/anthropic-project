/**
 * Simple file-based caching layer.
 *
 * Avoids hammering external APIs by caching responses to /tmp
 * with a configurable TTL per data source.
 */

interface CacheEntry<T> {
  data: T;
  cachedAt: number; // epoch ms
  ttlMs: number;
}

// In-memory cache — works reliably on Vercel serverless
const memoryCache = new Map<string, CacheEntry<unknown>>();

/**
 * Get a value from cache if it exists and hasn't expired.
 */
export function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const age = Date.now() - entry.cachedAt;
  if (age > entry.ttlMs) {
    memoryCache.delete(key);
    return null; // expired
  }

  return entry.data;
}

/**
 * Write a value to cache with a given TTL.
 */
export function setCache<T>(key: string, data: T, ttlMs: number): void {
  const entry: CacheEntry<T> = {
    data,
    cachedAt: Date.now(),
    ttlMs,
  };
  memoryCache.set(key, entry as CacheEntry<unknown>);
}

/**
 * Fetch with cache — tries cache first, falls back to fetcher function.
 * Only caches non-null results to avoid caching failures.
 */
export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  const data = await fetcher();
  if (data !== null && data !== undefined) {
    setCache(key, data, ttlMs);
  }
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

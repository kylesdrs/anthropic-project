/**
 * Diagnostic endpoint to debug swell data fetching.
 * Hit GET /api/debug-swell to see exactly what's happening.
 * DELETE THIS ENDPOINT once the issue is resolved.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Check if the env var exists
  const apiKey = process.env.WILLYWEATHER_API_KEY;
  results.envVarSet = !!apiKey;
  results.envVarLength = apiKey?.length ?? 0;
  results.envVarFirstChars = apiKey ? apiKey.substring(0, 4) + "..." : "NOT SET";

  // Also check common typos / alternate names
  results.alternateEnvVars = {
    WILLYWEATHER_API_KEY: !!process.env.WILLYWEATHER_API_KEY,
    WILLY_WEATHER_API_KEY: !!process.env.WILLY_WEATHER_API_KEY,
    WILLYWEATHER_KEY: !!process.env.WILLYWEATHER_KEY,
  };

  // 2. If the key exists, try calling the API directly
  if (apiKey) {
    const locationId = "4950";
    const url = `https://api.willyweather.com.au/v2/${apiKey}/locations/${locationId}/weather.json?forecasts=swell,wind&days=3`;

    try {
      const start = Date.now();
      const res = await fetch(url, { cache: "no-store" });
      const elapsed = Date.now() - start;

      results.apiCall = {
        url: url.replace(apiKey, "***REDACTED***"),
        status: res.status,
        statusText: res.statusText,
        elapsed: `${elapsed}ms`,
        headers: Object.fromEntries(res.headers.entries()),
      };

      if (res.ok) {
        const data = await res.json();
        const swellDays = data?.forecasts?.swell?.days ?? [];
        const allEntries = swellDays.flatMap((d: { entries?: unknown[] }) => d.entries ?? []);

        results.apiResponse = {
          success: true,
          hasForecasts: !!data?.forecasts,
          hasSwell: !!data?.forecasts?.swell,
          swellDayCount: swellDays.length,
          totalSwellEntries: allEntries.length,
          firstEntry: allEntries[0] ?? null,
          hasWind: !!data?.forecasts?.wind,
        };
      } else {
        const body = await res.text();
        results.apiResponse = {
          success: false,
          errorBody: body.substring(0, 500),
        };
      }
    } catch (err) {
      results.apiCall = {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3) : undefined,
      };
    }
  } else {
    results.apiCall = "SKIPPED — no API key found in environment";
  }

  // 3. Test Open-Meteo as comparison
  try {
    const omUrl =
      "https://marine-api.open-meteo.com/v1/marine?latitude=-33.74&longitude=151.32&hourly=swell_wave_height&forecast_days=1&timezone=Australia%2FSydney";
    const omRes = await fetch(omUrl, { cache: "no-store" });
    results.openMeteoStatus = omRes.status;
    if (omRes.ok) {
      const omData = await omRes.json();
      results.openMeteoWorking = !!(omData?.hourly?.time?.length > 0);
    }
  } catch {
    results.openMeteoStatus = "fetch failed";
  }

  // 4. List ALL env vars that start with WILLY (names only, not values)
  results.allWillyEnvVars = Object.keys(process.env).filter(k =>
    k.toUpperCase().includes("WILLY")
  );

  // 5. Node environment
  results.nodeEnv = process.env.NODE_ENV;
  results.vercelEnv = process.env.VERCEL_ENV ?? "not on vercel";

  return NextResponse.json(results, { status: 200 });
}

import { NextResponse } from "next/server";
import { northernBeachesSites } from "../../../sites/northern-beaches";
import { fetchWeatherData } from "../../../data/bom";
import { fetchSwellData } from "../../../data/swell";
import { fetchSharkActivity } from "../../../data/sharksmart";
import { rankSites } from "../../../engine/site-rank";
import { getTimeOfDay } from "../../../utils/sydney-time";

/**
 * GET /api/sites
 *
 * Returns the dive site database with current condition assessments and rankings.
 */
export async function GET() {
  try {
    const [weather, swell, sharkActivity] = await Promise.all([
      fetchWeatherData(),
      fetchSwellData(),
      fetchSharkActivity(),
    ]);

    if (!weather || !swell) {
      const missing: string[] = [];
      if (!weather) missing.push("weather");
      if (!swell) missing.push("swell");
      return NextResponse.json({
        sites: [],
        dataUnavailable: missing,
        fetchedAt: new Date().toISOString(),
      });
    }

    // Determine current time of day in Sydney timezone
    const timeOfDay = getTimeOfDay();

    const hasRealSharkData = sharkActivity.source === "live" || sharkActivity.source === "local";
    const rankings = rankSites(northernBeachesSites, {
      weather,
      swell,
      sharkActivity,
      timeOfDay,
      hasRealSharkData,
    });

    return NextResponse.json({
      sites: rankings,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sites fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch sites" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { northernBeachesSites } from "../../../sites/northern-beaches";
import { fetchWeatherData } from "../../../data/bom";
import { fetchSwellData } from "../../../data/swell";
import { fetchSharkActivity } from "../../../data/sharksmart";
import { rankSites } from "../../../engine/site-rank";

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

    // Determine current time of day
    const hour = new Date().getHours();
    let timeOfDay: "dawn" | "morning" | "midday" | "afternoon" | "dusk";
    if (hour < 6) timeOfDay = "dawn";
    else if (hour < 10) timeOfDay = "morning";
    else if (hour < 14) timeOfDay = "midday";
    else if (hour < 17) timeOfDay = "afternoon";
    else timeOfDay = "dusk";

    const rankings = rankSites(northernBeachesSites, {
      weather,
      swell,
      sharkActivity,
      timeOfDay,
    });

    return NextResponse.json({
      sites: rankings,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch sites", detail: message },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

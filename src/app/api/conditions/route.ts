import { NextResponse } from "next/server";
import { fetchWeatherData } from "../../../data/bom";
import { fetchSwellData } from "../../../data/swell";
import { fetchSharkActivity } from "../../../data/sharksmart";

/**
 * GET /api/conditions
 *
 * Returns current raw conditions data (swell, wind, temp, tides, rain, sharks).
 * Lighter than /api/briefing — no scoring or ranking.
 */
export async function GET() {
  try {
    const [weather, swell, sharkActivity] = await Promise.all([
      fetchWeatherData(),
      fetchSwellData(),
      fetchSharkActivity(),
    ]);

    // Temporary diagnostic: show WW env var status
    const wwKey = process.env.WILLYWEATHER_API_KEY;
    const _wwDiag = {
      envSet: !!wwKey,
      envLength: wwKey?.length ?? 0,
      envPrefix: wwKey ? wwKey.substring(0, 4) + "..." : "NOT SET",
      locationId: "30089",
    };

    return NextResponse.json({
      weather,
      swell,
      sharkActivity,
      _wwDiag,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch conditions", detail: message },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

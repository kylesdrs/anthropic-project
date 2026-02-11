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

    return NextResponse.json({
      weather,
      swell,
      sharkActivity,
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

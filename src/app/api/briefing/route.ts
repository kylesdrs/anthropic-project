import { NextRequest, NextResponse } from "next/server";
import { generateBriefing } from "../../../engine/briefing";

/**
 * GET /api/briefing?hour=7&site=bluefish-point
 *
 * Returns a full dive briefing. Optional params:
 * - `hour` (0-23): overrides the current hour for time-of-day calculations
 * - `site` (site id): scores the 5-day outlook and 18-hour forecast for this specific site
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hourParam = searchParams.get("hour");
    const siteParam = searchParams.get("site");
    const hour =
      hourParam !== null ? parseInt(hourParam, 10) : undefined;

    // Validate hour is within bounds
    const validHour =
      hour !== undefined && !isNaN(hour) && hour >= 0 && hour <= 23
        ? hour
        : undefined;

    const briefing = await generateBriefing({
      hour: validHour,
      siteId: siteParam ?? undefined,
    });

    return NextResponse.json(briefing);
  } catch (error) {
    console.error("Briefing generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

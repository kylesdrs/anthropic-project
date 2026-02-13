import { NextRequest, NextResponse } from "next/server";
import { generateBriefing } from "../../../engine/briefing";

/**
 * GET /api/briefing?hour=7
 *
 * Returns a full dive briefing. Optional `hour` param (0-23)
 * overrides the current hour for time-of-day calculations.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hourParam = searchParams.get("hour");
    const hour =
      hourParam !== null ? parseInt(hourParam, 10) : undefined;

    const briefing = await generateBriefing({
      hour: hour !== undefined && !isNaN(hour) ? hour : undefined,
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

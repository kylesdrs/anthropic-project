import { NextResponse } from "next/server";

/**
 * GET /api/briefing?date=2026-02-12&time=09:00
 *
 * Returns a full dive briefing for the requested date/time.
 */
export async function GET() {
  return NextResponse.json({
    message: "Briefing API — not yet implemented",
  });
}

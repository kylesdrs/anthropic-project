import { NextResponse } from "next/server";

/**
 * GET /api/conditions
 *
 * Returns current raw conditions data (swell, wind, temp, tides, rain).
 */
export async function GET() {
  return NextResponse.json({
    message: "Conditions API — not yet implemented",
  });
}

import { NextResponse } from "next/server";

/**
 * GET /api/sites
 *
 * Returns the dive site database with current condition assessments.
 */
export async function GET() {
  return NextResponse.json({
    message: "Sites API — not yet implemented",
  });
}

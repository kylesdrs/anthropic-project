import { NextRequest, NextResponse } from "next/server";
import { addVisReport, getCalibrationSummary } from "../../../data/calibration";
import { generateBriefing } from "../../../engine/briefing";
import { northernBeachesSites } from "../../../sites/northern-beaches";

/**
 * GET /api/calibration
 *
 * Returns calibration summary: all reports, per-site stats, avg delta.
 */
export async function GET() {
  try {
    const summary = getCalibrationSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Calibration summary failed:", error);
    return NextResponse.json(
      { error: "Failed to get calibration data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calibration
 *
 * Submit a diver vis report. Automatically snapshots the model's current
 * prediction for the same site to calculate the delta.
 *
 * Body: {
 *   siteId: string,
 *   reportedVis: number (metres),
 *   diverName: string,
 *   source?: "diver" | "abyss" | "other",
 *   notes?: string,
 *   observedAt?: string (ISO 8601, defaults to now)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const { siteId, reportedVis, diverName } = body;
    if (!siteId || typeof reportedVis !== "number" || !diverName) {
      return NextResponse.json(
        { error: "Missing required fields: siteId, reportedVis (number), diverName" },
        { status: 400 }
      );
    }

    if (reportedVis < 0 || reportedVis > 30) {
      return NextResponse.json(
        { error: "reportedVis must be between 0 and 30 metres" },
        { status: 400 }
      );
    }

    // Find the site
    const site = northernBeachesSites.find((s) => s.id === siteId);
    if (!site) {
      return NextResponse.json(
        {
          error: `Unknown siteId: ${siteId}`,
          validSites: northernBeachesSites.map((s) => ({ id: s.id, name: s.name })),
        },
        { status: 400 }
      );
    }

    // Snapshot model prediction for this site
    let modelPrediction = null;
    try {
      const briefing = await generateBriefing({ sites: [site] });
      const siteRanking = briefing.siteRankings.find((r) => r.site.id === siteId);
      if (siteRanking) {
        modelPrediction = {
          metres: siteRanking.visibility.metres,
          rating: siteRanking.visibility.rating,
          confidence: siteRanking.visibility.confidence,
          explanation: siteRanking.visibility.explanation,
        };
      }
    } catch {
      // Model prediction failed — still save the report
      console.warn("Could not snapshot model prediction for calibration report");
    }

    const report = addVisReport({
      observedAt: body.observedAt || new Date().toISOString(),
      siteId,
      siteName: site.name,
      reportedVis,
      diverName: String(diverName).slice(0, 50),
      source: body.source || "diver",
      notes: String(body.notes || "").slice(0, 500),
      modelPrediction,
    });

    return NextResponse.json({
      report,
      message: modelPrediction
        ? `Report saved. You reported ${reportedVis}m, model predicted ${modelPrediction.metres}m (delta: ${report.delta! > 0 ? "+" : ""}${report.delta}m)`
        : `Report saved. Model prediction unavailable for comparison.`,
    });
  } catch (error) {
    console.error("Calibration report submission failed:", error);
    return NextResponse.json(
      { error: "Failed to submit report" },
      { status: 500 }
    );
  }
}

/**
 * Visibility calibration data layer.
 *
 * Stores diver-reported visibility observations alongside what the model
 * predicted for the same conditions. Over time, the delta between predicted
 * and actual vis reveals systematic biases per site, season, and condition.
 *
 * Storage: in-memory for now (serverless). Reports persist for the life of
 * the serverless instance. For production, swap to a database or KV store.
 */

// --- Types ---

export interface VisReport {
  id: string;
  /** When the observation was made */
  observedAt: string; // ISO 8601
  /** Which site the diver was at */
  siteId: string;
  siteName: string;
  /** Actual vis observed by the diver (metres) */
  reportedVis: number;
  /** Who submitted the report */
  diverName: string;
  /** Source: "diver" for personal reports, "abyss" for Abyss Scuba, etc. */
  source: "diver" | "abyss" | "other";
  /** Optional free-text notes */
  notes: string;
  /** When the report was submitted to the system */
  submittedAt: string; // ISO 8601

  /** Model's prediction snapshot at time of submission */
  modelPrediction: {
    metres: number;
    rating: string;
    confidence: string;
    explanation: string;
  } | null;

  /** Delta: reported - predicted. Positive = model under-predicted, negative = over-predicted */
  delta: number | null;
}

export interface CalibrationSummary {
  totalReports: number;
  /** Average delta across all reports (positive = model under-predicts) */
  avgDelta: number;
  /** Per-site breakdown */
  bySite: {
    siteId: string;
    siteName: string;
    reportCount: number;
    avgDelta: number;
    avgReported: number;
    avgPredicted: number;
  }[];
  /** Recent reports (newest first) */
  recentReports: VisReport[];
}

// --- In-memory store ---

const reports: VisReport[] = [];
let nextId = 1;

/**
 * Add a new vis report.
 */
export function addVisReport(
  report: Omit<VisReport, "id" | "submittedAt" | "delta">
): VisReport {
  const delta =
    report.modelPrediction !== null
      ? Math.round((report.reportedVis - report.modelPrediction.metres) * 10) / 10
      : null;

  const full: VisReport = {
    ...report,
    id: `vr-${nextId++}`,
    submittedAt: new Date().toISOString(),
    delta,
  };

  reports.push(full);
  return full;
}

/**
 * Get all reports, newest first.
 */
export function getReports(): VisReport[] {
  return [...reports].reverse();
}

/**
 * Get calibration summary with per-site stats.
 */
export function getCalibrationSummary(): CalibrationSummary {
  const withDelta = reports.filter((r) => r.delta !== null);

  const avgDelta =
    withDelta.length > 0
      ? Math.round(
          (withDelta.reduce((sum, r) => sum + r.delta!, 0) / withDelta.length) * 10
        ) / 10
      : 0;

  // Group by site
  const siteMap = new Map<
    string,
    { siteId: string; siteName: string; deltas: number[]; reported: number[]; predicted: number[] }
  >();

  for (const r of withDelta) {
    let entry = siteMap.get(r.siteId);
    if (!entry) {
      entry = { siteId: r.siteId, siteName: r.siteName, deltas: [], reported: [], predicted: [] };
      siteMap.set(r.siteId, entry);
    }
    entry.deltas.push(r.delta!);
    entry.reported.push(r.reportedVis);
    entry.predicted.push(r.modelPrediction!.metres);
  }

  const bySite = Array.from(siteMap.values()).map((entry) => ({
    siteId: entry.siteId,
    siteName: entry.siteName,
    reportCount: entry.deltas.length,
    avgDelta: Math.round((entry.deltas.reduce((a, b) => a + b, 0) / entry.deltas.length) * 10) / 10,
    avgReported: Math.round((entry.reported.reduce((a, b) => a + b, 0) / entry.reported.length) * 10) / 10,
    avgPredicted: Math.round((entry.predicted.reduce((a, b) => a + b, 0) / entry.predicted.length) * 10) / 10,
  }));

  return {
    totalReports: reports.length,
    avgDelta,
    bySite,
    recentReports: [...reports].reverse().slice(0, 20),
  };
}

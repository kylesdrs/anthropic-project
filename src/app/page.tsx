"use client";

import { useEffect, useState } from "react";

// --- Types (matching API response) ---

interface DiveBriefing {
  generatedAt: string;
  timeOfDay: string;
  conditions: {
    weather: {
      observation: {
        airTemp: number;
        windSpeed: number;
        windGust: number;
        windDirection: string;
        humidity: number;
        pressure: number;
        rainfall: number;
      };
      tides: {
        currentState: string;
        nextHigh: { time: string; height: number } | null;
        nextLow: { time: string; height: number } | null;
      };
      rainfall: {
        last24h: number;
        last48h: number;
        last72h: number;
        daysSinceSignificantRain: number;
      };
      seaSurfaceTemp: number | null;
    };
    swell: {
      current: {
        height: number;
        period: number;
        direction: string;
      };
      trend: string;
    };
    sharkActivity: {
      alerts: SharkAlert[];
      daysSinceLastActivity: number | null;
      source: string;
    };
  };
  visibility: {
    metres: number;
    rating: string;
    confidence: string;
    factors: { name: string; impact: number; description: string }[];
  };
  siteRankings: SiteRanking[];
  recommendation: {
    go: boolean;
    confidence: string;
    summary: string;
    bestSite: string;
    bestTimeWindow: string;
    keyFactors: string[];
  };
}

interface SiteRanking {
  site: { id: string; name: string; status: string; restrictions: string };
  rank: number;
  diveScore: {
    overall: number;
    label: string;
    breakdown: {
      visibility: number;
      fishActivity: number;
      safety: number;
      comfort: number;
    };
    topReasons: string[];
    concerns: string[];
  };
  conditionsFit: {
    swellOk: boolean;
    windIdeal: boolean;
    tideGood: boolean;
    overallFit: string;
  };
  topSpecies: {
    name: string;
    likelihood: { score: number; reasoning: string };
    regulation: string;
  }[];
  warnings: string[];
}

interface SharkAlert {
  id: string;
  date: string;
  type: string;
  species: string;
  location: { beach: string };
  details: string;
}

// --- Helpers ---

function scoreColor(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 6.5) return "text-teal-400";
  if (score >= 5) return "text-yellow-400";
  if (score >= 3.5) return "text-orange-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 8) return "bg-emerald-500/20 border-emerald-500/30";
  if (score >= 6.5) return "bg-teal-500/20 border-teal-500/30";
  if (score >= 5) return "bg-yellow-500/20 border-yellow-500/30";
  if (score >= 3.5) return "bg-orange-500/20 border-orange-500/30";
  return "bg-red-500/20 border-red-500/30";
}

function riskColor(level: string): string {
  switch (level) {
    case "low":
      return "bg-emerald-500/20 text-emerald-400";
    case "moderate":
      return "bg-yellow-500/20 text-yellow-400";
    case "elevated":
      return "bg-orange-500/20 text-orange-400";
    case "high":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-ocean-800 text-ocean-400";
  }
}

function likelihoodColor(score: number): string {
  if (score >= 70) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 50) return "bg-teal-500/20 text-teal-400";
  if (score >= 30) return "bg-yellow-500/20 text-yellow-400";
  return "bg-ocean-800 text-ocean-400";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function alertTypeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Components ---

function ConditionCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl bg-ocean-900/40 border border-ocean-800 p-4">
      <p className="text-xs text-ocean-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-white">{value}</p>
      <p className="text-xs text-ocean-500 mt-1">{sub}</p>
    </div>
  );
}

function SiteCard({ ranking }: { ranking: SiteRanking }) {
  const { site, diveScore, conditionsFit, topSpecies, warnings } = ranking;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-xl border p-4 cursor-pointer transition-all ${scoreBg(diveScore.overall)}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-xs text-ocean-400 mr-2">#{ranking.rank}</span>
          <span className="font-medium text-white">{site.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${scoreColor(diveScore.overall)}`}>
            {diveScore.overall}
          </span>
          <span className="text-xs text-ocean-400">/10</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${scoreColor(diveScore.overall)} bg-ocean-900/60`}
        >
          {diveScore.label}
        </span>
        <span className="text-xs text-ocean-500">
          Fit: {conditionsFit.overallFit}
        </span>
      </div>

      {diveScore.topReasons.length > 0 && (
        <p className="text-xs text-ocean-300 mb-1">
          {diveScore.topReasons.join(" · ")}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="mt-2">
          {warnings.slice(0, 2).map((w, i) => (
            <p key={i} className="text-xs text-orange-400">
              {w}
            </p>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-ocean-800 space-y-3">
          {/* Score breakdown */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {(
              [
                ["Vis", diveScore.breakdown.visibility],
                ["Fish", diveScore.breakdown.fishActivity],
                ["Safety", diveScore.breakdown.safety],
                ["Comfort", diveScore.breakdown.comfort],
              ] as [string, number][]
            ).map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-ocean-500">{label}</p>
                <p className={`text-sm font-semibold ${scoreColor(val)}`}>
                  {val}
                </p>
              </div>
            ))}
          </div>

          {/* Top species */}
          {topSpecies.length > 0 && (
            <div>
              <p className="text-xs text-ocean-400 mb-1">Species</p>
              {topSpecies.slice(0, 4).map((sp) => (
                <div
                  key={sp.name}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-xs text-ocean-200">{sp.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ocean-500">
                      {sp.regulation}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${likelihoodColor(sp.likelihood.score)}`}
                    >
                      {sp.likelihood.score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {diveScore.concerns.length > 0 && (
            <div>
              <p className="text-xs text-ocean-400 mb-1">Concerns</p>
              {diveScore.concerns.map((c, i) => (
                <p key={i} className="text-xs text-orange-400">
                  {c}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Dashboard ---

export default function Dashboard() {
  const [briefing, setBriefing] = useState<DiveBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBriefing() {
      try {
        const res = await fetch("/api/briefing");
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setBriefing(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    fetchBriefing();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🤿</div>
          <p className="text-ocean-400">Loading conditions...</p>
        </div>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load briefing</p>
          <p className="text-ocean-500 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-ocean-800 text-ocean-200 text-sm hover:bg-ocean-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { conditions, visibility, siteRankings, recommendation } = briefing;
  const { weather, swell, sharkActivity } = conditions;
  const obs = weather.observation;

  return (
    <div className="space-y-8">
      {/* Hero: Recommendation */}
      <section
        className={`rounded-2xl border p-6 sm:p-8 ${recommendation.go ? scoreBg(siteRankings[0]?.diveScore.overall ?? 5) : "bg-red-500/10 border-red-500/20"}`}
      >
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="text-center sm:text-left flex-1">
            <p className="text-sm uppercase tracking-wider text-ocean-400 mb-2">
              Dive Briefing · {briefing.timeOfDay}
            </p>
            <p className="text-lg sm:text-xl text-white font-medium mb-3">
              {recommendation.summary}
            </p>
            <p className="text-sm text-ocean-300">
              {recommendation.bestTimeWindow}
            </p>
          </div>
          <div className="text-center">
            <div
              className={`text-6xl sm:text-7xl font-bold ${scoreColor(siteRankings[0]?.diveScore.overall ?? 0)}`}
            >
              {siteRankings[0]?.diveScore.overall ?? "—"}
            </div>
            <p className="text-sm text-ocean-400 mt-1">
              {siteRankings[0]?.diveScore.label ?? "—"} · {recommendation.bestSite}
            </p>
          </div>
        </div>

        {/* Key factors */}
        <div className="flex flex-wrap gap-2 mt-4">
          {recommendation.keyFactors.map((f, i) => (
            <span
              key={i}
              className="text-xs px-2.5 py-1 rounded-full bg-ocean-900/60 text-ocean-300"
            >
              {f}
            </span>
          ))}
        </div>
      </section>

      {/* Conditions Strip */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Current Conditions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <ConditionCard
            label="Swell"
            value={`${swell.current.height}m`}
            sub={`${swell.current.period}s ${swell.current.direction} · ${swell.trend}`}
          />
          <ConditionCard
            label="Wind"
            value={`${obs.windSpeed}kt`}
            sub={`${obs.windDirection} · gusts ${obs.windGust}kt`}
          />
          <ConditionCard
            label="Water Temp"
            value={
              weather.seaSurfaceTemp
                ? `${weather.seaSurfaceTemp}°C`
                : "—"
            }
            sub={`Air ${obs.airTemp}°C`}
          />
          <ConditionCard
            label="Visibility"
            value={`${visibility.metres}m`}
            sub={`${visibility.rating} · ${visibility.confidence} confidence`}
          />
          <ConditionCard
            label="Tide"
            value={weather.tides.currentState.replace("_", " ")}
            sub={
              weather.tides.nextHigh
                ? `High ${formatTime(weather.tides.nextHigh.time)} (${weather.tides.nextHigh.height}m)`
                : "—"
            }
          />
          <ConditionCard
            label="Rain (48h)"
            value={`${weather.rainfall.last48h}mm`}
            sub={`${weather.rainfall.daysSinceSignificantRain}d since heavy rain`}
          />
        </div>
      </section>

      {/* Visibility factors */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Visibility Breakdown
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {visibility.factors.map((f) => (
            <div
              key={f.name}
              className="rounded-lg bg-ocean-900/40 border border-ocean-800 p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-ocean-400">{f.name}</span>
                <span
                  className={`text-xs font-semibold ${f.impact > 0 ? "text-emerald-400" : f.impact < 0 ? "text-red-400" : "text-ocean-500"}`}
                >
                  {f.impact > 0 ? "+" : ""}
                  {f.impact}m
                </span>
              </div>
              <p className="text-[10px] text-ocean-500 leading-tight">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Site Rankings */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Site Rankings
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {siteRankings.map((ranking) => (
            <SiteCard key={ranking.site.id} ranking={ranking} />
          ))}
        </div>
      </section>

      {/* Species Forecast */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Species Forecast
          <span className="text-ocean-600 ml-2 normal-case">
            (at {siteRankings[0]?.site.name ?? "best site"})
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(siteRankings[0]?.topSpecies ?? []).map((sp) => (
            <div
              key={sp.name}
              className="rounded-lg bg-ocean-900/40 border border-ocean-800 p-3 flex items-center justify-between"
            >
              <div>
                <span className="text-sm text-white">{sp.name}</span>
                <p className="text-[10px] text-ocean-500 mt-0.5">
                  {sp.regulation}
                </p>
              </div>
              <span
                className={`text-sm font-semibold px-2.5 py-1 rounded-full ${likelihoodColor(sp.likelihood.score)}`}
              >
                {sp.likelihood.score}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Safety Panel */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Shark Activity
        </h2>
        <div className="rounded-xl bg-ocean-900/40 border border-ocean-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-medium text-white">Risk Level</span>
            {siteRankings[0] && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-ocean-800 text-ocean-400">
                Based on {siteRankings[0].site.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-ocean-300">
              {sharkActivity.daysSinceLastActivity !== null
                ? `Last activity ${sharkActivity.daysSinceLastActivity} day(s) ago`
                : "No recent activity recorded"}
            </span>
            <span className="text-xs text-ocean-600">
              Source: {sharkActivity.source}
            </span>
          </div>

          {sharkActivity.alerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-ocean-400">Recent alerts</p>
              {sharkActivity.alerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 py-2 border-t border-ocean-800/50"
                >
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${riskColor(alert.species === "white" ? "elevated" : "moderate")}`}
                  >
                    {alert.species}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-ocean-200">{alert.details}</p>
                    <p className="text-[10px] text-ocean-500 mt-0.5">
                      {alertTypeLabel(alert.type)} · {alert.location.beach} ·{" "}
                      {relativeDate(alert.date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-xs text-ocean-600 pb-8">
        <p>
          Generated {new Date(briefing.generatedAt).toLocaleString("en-AU")} ·
          Data from BOM, Willyweather, SharkSmart
        </p>
        <p className="mt-1">
          Not a safety tool. Always assess conditions yourself before entering
          the water.
        </p>
      </footer>
    </div>
  );
}

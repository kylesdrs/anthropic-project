"use client";

import { useEffect, useState } from "react";

// --- Types (matching API response) ---

interface DataSourceStatus {
  weather: { available: boolean; source: string };
  swell: { available: boolean; source: string };
  shark: { available: boolean; source: string };
}

interface DiveBriefing {
  generatedAt: string;
  timeOfDay: string;
  dataStatus: DataSourceStatus;
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
    } | null;
    swell: {
      current: {
        height: number;
        period: number;
        direction: string;
      };
      trend: string;
    } | null;
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
  } | null;
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

interface SiteVisibility {
  metres: number;
  rating: string;
  confidence: string;
  factors: { name: string; impact: number; description: string }[];
}

interface SiteSharkRisk {
  level: string;
  score: number;
  recommendation: string;
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
    swellProtected?: boolean;
    windIdeal: boolean;
    tideGood: boolean;
    overallFit: string;
  };
  visibility?: SiteVisibility;
  sharkRisk?: SiteSharkRisk;
  topSpecies: {
    name: string;
    likelihood: { score: number; reasoning: string };
    regulation: string;
  }[];
  warnings: string[];
  explanation?: string;
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

function SiteCard({
  ranking,
  conditions,
}: {
  ranking: SiteRanking;
  conditions: DiveBriefing["conditions"];
}) {
  const { site, diveScore, conditionsFit, topSpecies, warnings, visibility, sharkRisk, explanation } = ranking;
  const [expanded, setExpanded] = useState(false);

  const swell = conditions.swell;
  const obs = conditions.weather?.observation ?? null;
  const weather = conditions.weather;

  return (
    <div
      className={`rounded-xl border p-4 cursor-pointer transition-all ${scoreBg(diveScore.overall)}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
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
        <span className="text-xs text-ocean-600">
          {expanded ? "tap to collapse" : "tap for detail"}
        </span>
      </div>

      {diveScore.topReasons.length > 0 && (
        <p className="text-xs text-ocean-300 mb-1">
          {diveScore.topReasons.join(" · ")}
        </p>
      )}

      {warnings.length > 0 && !expanded && (
        <div className="mt-2">
          {warnings.slice(0, 2).map((w, i) => (
            <p key={i} className="text-xs text-orange-400">
              {w}
            </p>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-ocean-800 space-y-4">
          {/* Explanation paragraph */}
          {explanation && (
            <div className="rounded-lg bg-ocean-950/60 border border-ocean-700/40 p-3">
              <p className="text-xs font-medium text-ocean-300 mb-1.5">Why this score?</p>
              <p className="text-sm text-ocean-200 leading-relaxed">
                {explanation}
              </p>
            </div>
          )}

          {/* Conditions at this site */}
          <div>
            <p className="text-xs font-medium text-ocean-400 mb-2">Conditions at {site.name}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-ocean-950/50 p-2.5">
                <p className="text-[10px] text-ocean-500">Swell</p>
                <p className="text-sm font-semibold text-white">
                  {swell ? `${swell.current.height}m` : "—"}
                </p>
                <p className="text-[10px] text-ocean-500">
                  {swell ? `${swell.current.period}s ${swell.current.direction} · ${swell.trend}` : "—"}
                </p>
                {conditionsFit.swellOk ? (
                  <p className="text-[10px] text-emerald-400 mt-0.5">Within site limit</p>
                ) : (
                  <p className="text-[10px] text-red-400 mt-0.5">Exceeds site limit</p>
                )}
              </div>

              <div className="rounded-lg bg-ocean-950/50 p-2.5">
                <p className="text-[10px] text-ocean-500">Wind</p>
                <p className="text-sm font-semibold text-white">
                  {obs ? `${obs.windSpeed}kt ${obs.windDirection}` : "—"}
                </p>
                <p className="text-[10px] text-ocean-500">
                  {obs ? `Gusts ${obs.windGust}kt` : "—"}
                </p>
                {conditionsFit.windIdeal ? (
                  <p className="text-[10px] text-emerald-400 mt-0.5">Ideal direction</p>
                ) : (
                  <p className="text-[10px] text-yellow-400 mt-0.5">Not ideal direction</p>
                )}
              </div>

              <div className="rounded-lg bg-ocean-950/50 p-2.5">
                <p className="text-[10px] text-ocean-500">Visibility</p>
                <p className={`text-sm font-semibold ${visibility ? scoreColor(diveScore.breakdown.visibility) : "text-ocean-500"}`}>
                  {visibility ? `${visibility.metres}m` : "—"}
                </p>
                <p className="text-[10px] text-ocean-500">
                  {visibility ? `${visibility.rating} · ${visibility.confidence} conf.` : "—"}
                </p>
              </div>

              <div className="rounded-lg bg-ocean-950/50 p-2.5">
                <p className="text-[10px] text-ocean-500">Tide</p>
                <p className="text-sm font-semibold text-white">
                  {weather ? weather.tides.currentState.replace("_", " ") : "—"}
                </p>
                <p className="text-[10px] text-ocean-500">
                  {weather?.tides.nextHigh
                    ? `High ${formatTime(weather.tides.nextHigh.time)} (${weather.tides.nextHigh.height}m)`
                    : "—"}
                </p>
                {conditionsFit.tideGood ? (
                  <p className="text-[10px] text-emerald-400 mt-0.5">Good for this site</p>
                ) : (
                  <p className="text-[10px] text-yellow-400 mt-0.5">Not ideal</p>
                )}
              </div>

              <div className="rounded-lg bg-ocean-950/50 p-2.5">
                <p className="text-[10px] text-ocean-500">Rain (48h)</p>
                <p className="text-sm font-semibold text-white">
                  {weather ? `${weather.rainfall.last48h}mm` : "—"}
                </p>
                <p className="text-[10px] text-ocean-500">
                  {weather ? `${weather.rainfall.daysSinceSignificantRain}d since heavy` : "—"}
                </p>
              </div>

              <div className="rounded-lg bg-ocean-950/50 p-2.5">
                <p className="text-[10px] text-ocean-500">Shark Risk</p>
                <p className={`text-sm font-semibold ${
                  sharkRisk?.level === "low" ? "text-emerald-400" :
                  sharkRisk?.level === "moderate" ? "text-yellow-400" :
                  sharkRisk?.level === "elevated" ? "text-orange-400" :
                  sharkRisk?.level === "high" ? "text-red-400" : "text-ocean-400"
                }`}>
                  {sharkRisk ? sharkRisk.level : "—"}
                </p>
                <p className="text-[10px] text-ocean-500">
                  {sharkRisk ? `Score: ${sharkRisk.score}/100` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Visibility factors for this site */}
          {visibility && visibility.factors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ocean-400 mb-2">Visibility Factors</p>
              <div className="grid grid-cols-2 gap-1.5">
                {visibility.factors.map((f) => (
                  <div key={f.name} className="flex items-center justify-between rounded bg-ocean-950/40 px-2 py-1.5">
                    <span className="text-[10px] text-ocean-400">{f.name}</span>
                    <span className={`text-[10px] font-semibold ${
                      f.impact > 0 ? "text-emerald-400" : f.impact < 0 ? "text-red-400" : "text-ocean-500"
                    }`}>
                      {f.impact > 0 ? "+" : ""}{f.impact}m
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ocean-300">
                We estimate <span className="font-semibold text-ocean-100">{visibility.metres}m</span> visibility ({visibility.rating}) at {site.name}.{" "}
                {visibility.factors
                  .filter((f) => f.impact !== 0)
                  .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
                  .map((f) => f.description)
                  .join(". ")}
                .
              </p>
            </div>
          )}

          {/* Score breakdown */}
          <div>
            <p className="text-xs font-medium text-ocean-400 mb-2">Score Breakdown</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {(
                [
                  ["Vis", diveScore.breakdown.visibility, "30%"],
                  ["Fish", diveScore.breakdown.fishActivity, "30%"],
                  ["Safety", diveScore.breakdown.safety, "25%"],
                  ["Comfort", diveScore.breakdown.comfort, "15%"],
                ] as [string, number, string][]
              ).map(([label, val, weight]) => (
                <div key={label} className="rounded-lg bg-ocean-950/40 p-2">
                  <p className="text-[10px] text-ocean-500">{label}</p>
                  <p className={`text-lg font-bold ${scoreColor(val)}`}>{val}</p>
                  <p className="text-[10px] text-ocean-600">{weight}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top species */}
          {topSpecies.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ocean-400 mb-2">Species Forecast</p>
              {topSpecies.map((sp) => (
                <div
                  key={sp.name}
                  className="flex items-center justify-between py-1.5 border-b border-ocean-800/30 last:border-0"
                >
                  <div>
                    <span className="text-xs text-ocean-200">{sp.name}</span>
                    <p className="text-[10px] text-ocean-500">{sp.regulation}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${likelihoodColor(sp.likelihood.score)}`}
                  >
                    {sp.likelihood.score}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings / concerns */}
          {(warnings.length > 0 || diveScore.concerns.length > 0) && (
            <div>
              <p className="text-xs font-medium text-ocean-400 mb-1">Warnings</p>
              {warnings.map((w, i) => (
                <p key={`w-${i}`} className="text-xs text-orange-400 mb-0.5">{w}</p>
              ))}
              {diveScore.concerns.map((c, i) => (
                <p key={`c-${i}`} className="text-xs text-orange-400 mb-0.5">{c}</p>
              ))}
            </div>
          )}

          {/* Site info */}
          {site.restrictions && (
            <div className="rounded-lg bg-ocean-950/40 p-2.5">
              <p className="text-[10px] text-ocean-500 mb-0.5">Regulations</p>
              <p className="text-[10px] text-ocean-300 leading-snug">{site.restrictions}</p>
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecastHour, setForecastHour] = useState<string>("now");

  async function fetchBriefing(isRefresh = false, hour?: string) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const h = hour ?? forecastHour;
      const url = h === "now" ? "/api/briefing" : `/api/briefing?hour=${h}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setBriefing(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the briefing API. Is the server running?"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleHourChange(value: string) {
    setForecastHour(value);
    fetchBriefing(true, value);
  }

  useEffect(() => {
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
            onClick={() => fetchBriefing()}
            className="mt-4 px-4 py-2 rounded-lg bg-ocean-800 text-ocean-200 text-sm hover:bg-ocean-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { conditions, visibility, siteRankings, recommendation, dataStatus } = briefing;
  const { weather, swell, sharkActivity } = conditions;
  const obs = weather?.observation ?? null;

  // Identify unavailable data sources
  const unavailableSources = [
    !dataStatus?.weather?.available && "Weather (BOM)",
    !dataStatus?.swell?.available && "Swell",
    dataStatus?.shark?.source === "seed" && "Shark activity (using sample data)",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      {/* Refresh bar + Time selector */}
      <div className="flex items-center justify-center gap-3">
        <select
          value={forecastHour}
          onChange={(e) => handleHourChange(e.target.value)}
          disabled={refreshing}
          className="px-3 py-2.5 rounded-lg bg-ocean-800 text-white text-sm font-medium border border-ocean-700 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
        >
          <option value="now">Now</option>
          {Array.from({ length: 24 }, (_, i) => {
            const label = i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`;
            return (
              <option key={i} value={String(i)}>
                {label}
              </option>
            );
          })}
        </select>
        <button
          onClick={() => fetchBriefing(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {refreshing ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {/* Data availability warning */}
      {unavailableSources.length > 0 && (
        <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-4">
          <p className="text-sm font-medium text-orange-400 mb-1">
            Some data sources are unavailable
          </p>
          <p className="text-xs text-orange-300/80">
            {unavailableSources.join(" · ")}
          </p>
          <p className="text-xs text-orange-500/70 mt-1">
            Values shown as &ldquo;—&rdquo; could not be fetched from live sources. Do not rely on incomplete data for safety decisions.
          </p>
        </div>
      )}

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
            value={swell ? `${swell.current.height}m` : "—"}
            sub={swell ? `${swell.current.period}s ${swell.current.direction} · ${swell.trend}` : "Data unavailable"}
          />
          <ConditionCard
            label="Wind"
            value={obs ? `${obs.windSpeed}kt ${obs.windDirection}` : "—"}
            sub={obs ? `Gusts ${obs.windGust}kt` : "Data unavailable"}
          />
          <ConditionCard
            label="Water Temp"
            value={
              weather?.seaSurfaceTemp
                ? `${weather.seaSurfaceTemp}°C`
                : "—"
            }
            sub={obs ? `Air ${obs.airTemp}°C` : "Data unavailable"}
          />
          <ConditionCard
            label="Visibility"
            value={visibility ? `${visibility.metres}m` : "—"}
            sub={visibility ? `${visibility.rating} · ${visibility.confidence} confidence` : "Requires weather + swell data"}
          />
          <ConditionCard
            label="Tide"
            value={weather ? weather.tides.currentState.replace("_", " ") : "—"}
            sub={
              weather?.tides.nextHigh
                ? `High ${formatTime(weather.tides.nextHigh.time)} (${weather.tides.nextHigh.height}m)`
                : "—"
            }
          />
          <ConditionCard
            label="Rain (48h)"
            value={weather ? `${weather.rainfall.last48h}mm` : "—"}
            sub={weather ? `${weather.rainfall.daysSinceSignificantRain}d since heavy rain` : "Data unavailable"}
          />
        </div>
      </section>

      {/* Visibility factors */}
      {visibility && (
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
      )}

      {/* Site Rankings */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Site Rankings
        </h2>
        {siteRankings.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {siteRankings.map((ranking) => (
              <SiteCard key={ranking.site.id} ranking={ranking} conditions={conditions} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-ocean-900/40 border border-ocean-800 p-6 text-center">
            <p className="text-ocean-400 text-sm">Site rankings unavailable — requires weather and swell data</p>
          </div>
        )}
      </section>

      {/* Species Forecast */}
      {siteRankings.length > 0 && (
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
      )}

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

          {sharkActivity.source === "seed" && (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2.5 mb-3">
              <p className="text-[11px] text-yellow-400">
                Showing sample data — SharkSmart has no public API. For live alerts, use the{" "}
                <a href="https://www.sharksmart.nsw.gov.au/sharksmart-app" target="_blank" rel="noopener noreferrer" className="underline">SharkSmart app</a>.
              </p>
            </div>
          )}

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
          Weather: {dataStatus?.weather?.source ?? "unknown"} ·
          Swell: {dataStatus?.swell?.source ?? "unknown"} ·
          Sharks: {dataStatus?.shark?.source ?? "unknown"}
        </p>
        <p className="mt-1">
          Not a safety tool. Always assess conditions yourself before entering
          the water.
        </p>
      </footer>
    </div>
  );
}

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

// --- Site map data (Northern Beaches coastline) ---

const SITE_COORDS: { id: string; name: string; x: number; y: number }[] = [
  { id: "north-head",           name: "North Head",          x: 78, y: 92 },
  { id: "bluefish-point",       name: "Bluefish Point",      x: 73, y: 80 },
  { id: "freshwater-headland",  name: "Freshwater",          x: 71, y: 72 },
  { id: "curl-curl-headland",   name: "Curl Curl",           x: 68, y: 62 },
  { id: "dee-why-head",         name: "Dee Why Head",        x: 72, y: 48 },
  { id: "long-reef",            name: "Long Reef",           x: 80, y: 38 },
  { id: "narrabeen-head",       name: "Narrabeen Head",      x: 73, y: 24 },
];

// --- Helpers ---

function scoreColor(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 6.5) return "text-teal-400";
  if (score >= 5) return "text-yellow-400";
  if (score >= 3.5) return "text-orange-400";
  return "text-red-400";
}

function scoreGlow(score: number): string {
  if (score >= 8) return "score-glow-green";
  if (score >= 6.5) return "score-glow-teal";
  if (score >= 5) return "score-glow-yellow";
  if (score >= 3.5) return "score-glow-orange";
  return "score-glow-red";
}

function scoreBorderAccent(score: number): string {
  if (score >= 8) return "border-emerald-500/20";
  if (score >= 6.5) return "border-teal-500/20";
  if (score >= 5) return "border-yellow-500/20";
  if (score >= 3.5) return "border-orange-500/20";
  return "border-red-500/20";
}

function sonarColor(score: number): string {
  if (score >= 8) return "sonar-green";
  if (score >= 6.5) return "sonar-teal";
  if (score >= 5) return "sonar-yellow";
  if (score >= 3.5) return "sonar-orange";
  return "sonar-red";
}

function riskColor(level: string): string {
  switch (level) {
    case "low":
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
    case "moderate":
      return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20";
    case "elevated":
      return "bg-orange-500/15 text-orange-400 border border-orange-500/20";
    case "high":
      return "bg-red-500/15 text-red-400 border border-red-500/20";
    default:
      return "bg-ocean-800/50 text-ocean-400";
  }
}

function likelihoodColor(score: number): string {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-400";
  if (score >= 50) return "bg-teal-500/15 text-teal-400";
  if (score >= 30) return "bg-yellow-500/15 text-yellow-400";
  return "bg-ocean-800/50 text-ocean-400";
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

function heroGlow(score: number): string {
  if (score >= 8) return "hero-glow-green";
  if (score >= 6.5) return "hero-glow-teal";
  if (score >= 5) return "hero-glow-yellow";
  if (score >= 3.5) return "hero-glow-orange";
  return "hero-glow-red";
}

// --- Skeleton Loading ---

function SkeletonLoader() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero skeleton */}
      <div className="glass-card p-8">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 space-y-3 w-full">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-6 w-3/4" />
            <div className="skeleton h-4 w-48" />
          </div>
          <div className="skeleton h-24 w-24 rounded-2xl" />
        </div>
        <div className="flex gap-2 mt-6">
          <div className="skeleton h-7 w-24 rounded-full" />
          <div className="skeleton h-7 w-32 rounded-full" />
          <div className="skeleton h-7 w-20 rounded-full" />
        </div>
      </div>

      {/* Conditions skeleton */}
      <div>
        <div className="skeleton h-4 w-40 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-children">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card p-4 space-y-2">
              <div className="skeleton h-3 w-12" />
              <div className="skeleton h-6 w-16" />
              <div className="skeleton h-3 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Sites skeleton */}
      <div>
        <div className="skeleton h-4 w-32 mb-4" />
        <div className="grid gap-4 sm:grid-cols-2 stagger-children">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-5 space-y-3">
              <div className="flex justify-between">
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-8 w-12 rounded-lg" />
              </div>
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Section Header ---

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 pt-2">
      <div className="section-divider mb-5" />
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-ocean-300">
        {title}
      </h2>
      {subtitle && (
        <p className="text-[11px] text-ocean-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

// --- Site Map ---

function SiteMap({ rankings }: { rankings: SiteRanking[] }) {
  const rankedIds = new Map(rankings.map((r) => [r.site.id, r]));

  return (
    <div className="glass-card p-5 overflow-hidden">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ocean-400 mb-3">
        Northern Beaches
      </p>
      <div className="relative w-full" style={{ paddingBottom: "110%" }}>
        <svg
          viewBox="0 0 100 110"
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Simplified coastline path */}
          <path
            d="M82,95 C80,90 76,85 74,80 C72,76 70,73 69,70 C67,65 66,62 67,58 C68,53 70,50 71,46 C73,42 77,39 80,36 C78,32 75,28 73,24 C71,20 70,16 70,12"
            fill="none"
            stroke="rgba(45,212,191,0.15)"
            strokeWidth="1"
            strokeLinecap="round"
          />
          {/* Ocean area hint */}
          <path
            d="M82,95 C80,90 76,85 74,80 C72,76 70,73 69,70 C67,65 66,62 67,58 C68,53 70,50 71,46 C73,42 77,39 80,36 C78,32 75,28 73,24 C71,20 70,16 70,12 L100,12 L100,95 Z"
            fill="rgba(0,152,204,0.03)"
          />
          {/* Site dots and labels */}
          {SITE_COORDS.map((site) => {
            const ranking = rankedIds.get(site.id);
            const score = ranking?.diveScore.overall ?? 0;
            const isTop = ranking?.rank === 1;
            const dotColor = score >= 8 ? "#34d399" : score >= 6.5 ? "#2dd4bf" : score >= 5 ? "#facc15" : score >= 3.5 ? "#fb923c" : "#f87171";
            return (
              <g key={site.id} className="map-dot">
                {/* Glow ring for #1 */}
                {isTop && (
                  <circle cx={site.x} cy={site.y} r="4" fill="none" stroke={dotColor} strokeWidth="0.5" opacity="0.4" />
                )}
                <circle cx={site.x} cy={site.y} r={isTop ? 2.5 : 1.8} fill={dotColor} opacity={isTop ? 1 : 0.7} />
                {/* Label */}
                <text
                  x={site.x - 4}
                  y={site.y - 4}
                  textAnchor="end"
                  className="fill-ocean-400"
                  style={{ fontSize: "3.2px", fontFamily: "system-ui" }}
                >
                  {site.name}
                </text>
                {/* Rank badge */}
                {ranking && (
                  <text
                    x={site.x + 4}
                    y={site.y + 1.2}
                    textAnchor="start"
                    style={{ fontSize: "3px", fontFamily: "system-ui", fontWeight: 700 }}
                    fill={dotColor}
                  >
                    #{ranking.rank}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// --- Components ---

function ConditionCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: string;
}) {
  return (
    <div className="glass-card p-4 group">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm opacity-60 group-hover:opacity-80 transition-opacity">{icon}</span>
        <p className="text-[11px] font-medium text-ocean-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-xl font-bold text-white leading-tight">{value}</p>
      <p className="text-[11px] text-ocean-500 mt-1.5 leading-snug">{sub}</p>
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
      className={`glass-card p-5 cursor-pointer transition-all duration-200 ${scoreBorderAccent(diveScore.overall)} ${expanded ? "ring-1 ring-white/[0.08]" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-ocean-500 bg-ocean-800/60 px-1.5 py-0.5 rounded">
              #{ranking.rank}
            </span>
            <h3 className="font-semibold text-white text-[15px] truncate">{site.name}</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${scoreColor(diveScore.overall)} bg-ocean-900/80`}
            >
              {diveScore.label}
            </span>
            <span className="text-[10px] text-ocean-500">
              {conditionsFit.overallFit}
            </span>
          </div>
        </div>
        <div className={`flex flex-col items-center ml-3 px-3 py-1.5 rounded-xl bg-ocean-950/60 ${scoreGlow(diveScore.overall)}`}>
          <span className={`text-2xl font-bold leading-none ${scoreColor(diveScore.overall)}`}>
            {diveScore.overall}
          </span>
          <span className="text-[9px] text-ocean-500 mt-0.5">/10</span>
        </div>
      </div>

      {diveScore.topReasons.length > 0 && (
        <p className="text-[11px] text-ocean-300 leading-relaxed mb-2">
          {diveScore.topReasons.join(" · ")}
        </p>
      )}

      {warnings.length > 0 && !expanded && (
        <div className="mt-2 space-y-0.5">
          {warnings.slice(0, 2).map((w, i) => (
            <p key={i} className="text-[11px] text-orange-400/80">
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Expand hint */}
      <div className="flex items-center justify-center mt-3 pt-2 border-t border-white/[0.04]">
        <span className="text-[10px] text-ocean-600">
          {expanded ? "tap to collapse" : "tap for details"}
        </span>
        <svg
          className={`w-3 h-3 ml-1 text-ocean-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-4 animate-fade-in">
          {/* Explanation paragraph */}
          {explanation && (
            <div className="rounded-xl bg-ocean-950/60 border border-white/[0.04] p-3.5">
              <p className="text-[10px] font-semibold text-ocean-400 uppercase tracking-wider mb-1.5">Why this score?</p>
              <p className="text-[13px] text-ocean-200 leading-relaxed">
                {explanation}
              </p>
            </div>
          )}

          {/* Conditions at this site */}
          <div>
            <p className="text-[10px] font-semibold text-ocean-400 uppercase tracking-wider mb-2">Site Conditions</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-ocean-950/50 border border-white/[0.03] p-3">
                <p className="text-[10px] text-ocean-500 mb-1">Swell</p>
                <p className="text-sm font-semibold text-white">
                  {swell ? `${swell.current.height}m` : "—"}
                </p>
                <p className="text-[10px] text-ocean-500 mt-0.5">
                  {swell ? `${swell.current.period}s ${swell.current.direction} · ${swell.trend}` : "—"}
                </p>
                {conditionsFit.swellOk ? (
                  <p className="text-[10px] text-emerald-400 mt-1">Within site limit</p>
                ) : (
                  <p className="text-[10px] text-red-400 mt-1">Exceeds site limit</p>
                )}
              </div>

              <div className="rounded-xl bg-ocean-950/50 border border-white/[0.03] p-3">
                <p className="text-[10px] text-ocean-500 mb-1">Wind</p>
                <p className="text-sm font-semibold text-white">
                  {obs ? `${obs.windSpeed}kt ${obs.windDirection}` : "—"}
                </p>
                <p className="text-[10px] text-ocean-500 mt-0.5">
                  {obs ? `Gusts ${obs.windGust}kt` : "—"}
                </p>
                {conditionsFit.windIdeal ? (
                  <p className="text-[10px] text-emerald-400 mt-1">Ideal direction</p>
                ) : (
                  <p className="text-[10px] text-yellow-400 mt-1">Not ideal direction</p>
                )}
              </div>

              <div className="rounded-xl bg-ocean-950/50 border border-white/[0.03] p-3">
                <p className="text-[10px] text-ocean-500 mb-1">Visibility</p>
                <p className={`text-sm font-semibold ${visibility ? scoreColor(diveScore.breakdown.visibility) : "text-ocean-500"}`}>
                  {visibility ? `${visibility.metres}m` : "—"}
                </p>
                <p className="text-[10px] text-ocean-500 mt-0.5">
                  {visibility ? `${visibility.rating} · ${visibility.confidence} conf.` : "—"}
                </p>
              </div>

              <div className="rounded-xl bg-ocean-950/50 border border-white/[0.03] p-3">
                <p className="text-[10px] text-ocean-500 mb-1">Tide</p>
                <p className="text-sm font-semibold text-white">
                  {weather ? weather.tides.currentState.replace("_", " ") : "—"}
                </p>
                <p className="text-[10px] text-ocean-500 mt-0.5">
                  {weather?.tides.nextHigh
                    ? `High ${formatTime(weather.tides.nextHigh.time)} (${weather.tides.nextHigh.height}m)`
                    : "—"}
                </p>
                {conditionsFit.tideGood ? (
                  <p className="text-[10px] text-emerald-400 mt-1">Good for this site</p>
                ) : (
                  <p className="text-[10px] text-yellow-400 mt-1">Not ideal</p>
                )}
              </div>

              <div className="rounded-xl bg-ocean-950/50 border border-white/[0.03] p-3">
                <p className="text-[10px] text-ocean-500 mb-1">Rain (48h)</p>
                <p className="text-sm font-semibold text-white">
                  {weather ? `${weather.rainfall.last48h}mm` : "—"}
                </p>
                <p className="text-[10px] text-ocean-500 mt-0.5">
                  {weather ? `${weather.rainfall.daysSinceSignificantRain}d since heavy` : "—"}
                </p>
              </div>

              <div className="rounded-xl bg-ocean-950/50 border border-white/[0.03] p-3">
                <p className="text-[10px] text-ocean-500 mb-1">Shark Risk</p>
                <p className={`text-sm font-semibold ${
                  sharkRisk?.level === "low" ? "text-emerald-400" :
                  sharkRisk?.level === "moderate" ? "text-yellow-400" :
                  sharkRisk?.level === "elevated" ? "text-orange-400" :
                  sharkRisk?.level === "high" ? "text-red-400" : "text-ocean-400"
                }`}>
                  {sharkRisk ? sharkRisk.level : "—"}
                </p>
                <p className="text-[10px] text-ocean-500 mt-0.5">
                  {sharkRisk ? `Score: ${sharkRisk.score}/100` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Visibility factors for this site */}
          {visibility && visibility.factors.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-ocean-400 uppercase tracking-wider mb-2">Visibility Factors</p>
              <div className="grid grid-cols-2 gap-1.5">
                {visibility.factors.map((f) => (
                  <div key={f.name} className="flex items-center justify-between rounded-lg bg-ocean-950/40 border border-white/[0.03] px-2.5 py-2">
                    <span className="text-[10px] text-ocean-400">{f.name}</span>
                    <span className={`text-[10px] font-bold ${
                      f.impact > 0 ? "text-emerald-400" : f.impact < 0 ? "text-red-400" : "text-ocean-500"
                    }`}>
                      {f.impact > 0 ? "+" : ""}{f.impact}m
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score breakdown */}
          <div>
            <p className="text-[10px] font-semibold text-ocean-400 uppercase tracking-wider mb-2">Score Breakdown</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {(
                [
                  ["Vis", diveScore.breakdown.visibility, "30%"],
                  ["Fish", diveScore.breakdown.fishActivity, "30%"],
                  ["Safety", diveScore.breakdown.safety, "25%"],
                  ["Comfort", diveScore.breakdown.comfort, "15%"],
                ] as [string, number, string][]
              ).map(([label, val, weight]) => (
                <div key={label} className="rounded-xl bg-ocean-950/50 border border-white/[0.03] p-2.5">
                  <p className="text-[10px] text-ocean-500">{label}</p>
                  <p className={`text-lg font-bold ${scoreColor(val)}`}>{val}</p>
                  <p className="text-[9px] text-ocean-600">{weight}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top species */}
          {topSpecies.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-ocean-400 uppercase tracking-wider mb-2">Species Forecast</p>
              <div className="space-y-1">
                {topSpecies.map((sp) => (
                  <div
                    key={sp.name}
                    className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-ocean-950/30 transition-colors"
                  >
                    <div>
                      <span className="text-xs text-ocean-200 font-medium">{sp.name}</span>
                      <p className="text-[10px] text-ocean-500">{sp.regulation}</p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${likelihoodColor(sp.likelihood.score)}`}
                    >
                      {sp.likelihood.score}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings / concerns */}
          {(warnings.length > 0 || diveScore.concerns.length > 0) && (
            <div className="rounded-xl bg-orange-500/5 border border-orange-500/10 p-3">
              <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-1.5">Warnings</p>
              {warnings.map((w, i) => (
                <p key={`w-${i}`} className="text-[11px] text-orange-400/80 mb-0.5">{w}</p>
              ))}
              {diveScore.concerns.map((c, i) => (
                <p key={`c-${i}`} className="text-[11px] text-orange-400/80 mb-0.5">{c}</p>
              ))}
            </div>
          )}

          {/* Site info */}
          {site.restrictions && (
            <div className="rounded-xl bg-ocean-950/40 border border-white/[0.03] p-3">
              <p className="text-[10px] text-ocean-500 mb-0.5">Regulations</p>
              <p className="text-[11px] text-ocean-300 leading-snug">{site.restrictions}</p>
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
    return <SkeletonLoader />;
  }

  if (error || !briefing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass-card p-8 text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-white font-medium mb-1">Failed to load briefing</p>
          <p className="text-ocean-400 text-sm mb-5">{error}</p>
          <button
            onClick={() => fetchBriefing()}
            className="px-5 py-2.5 rounded-xl bg-teal-500/15 text-teal-400 text-sm font-medium border border-teal-500/20 hover:bg-teal-500/25 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { conditions, visibility, siteRankings, recommendation, dataStatus } = briefing;
  const { weather, swell } = conditions;
  const obs = weather?.observation ?? null;
  const topScore = siteRankings[0]?.diveScore.overall ?? 0;

  // Identify unavailable data sources
  const unavailableSources = [
    !dataStatus?.weather?.available && "Weather (BOM)",
    !dataStatus?.swell?.available && "Swell",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-12 animate-fade-in-up">
      {/* Controls bar */}
      <div className="flex items-center justify-center gap-3">
        <select
          value={forecastHour}
          onChange={(e) => handleHourChange(e.target.value)}
          disabled={refreshing}
          className="px-3 py-2 rounded-xl bg-ocean-900/60 text-white text-sm font-medium border border-white/[0.06] focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:opacity-50 backdrop-blur-sm"
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
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-500/15 text-teal-400 font-medium text-sm border border-teal-500/20 hover:bg-teal-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Data availability warning */}
      {unavailableSources.length > 0 && (
        <div className="glass-card border-orange-500/15 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-orange-400 mb-0.5">
                Some data sources are unavailable
              </p>
              <p className="text-[11px] text-orange-300/70">
                {unavailableSources.join(" · ")}
              </p>
              <p className="text-[11px] text-ocean-500 mt-1">
                Do not rely on incomplete data for safety decisions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero: Recommendation */}
      <section className={`hero-card p-7 sm:p-10 ${heroGlow(topScore)}`}>
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-8">
          <div className="text-center sm:text-left flex-1 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean-400">
              Dive Briefing · {briefing.timeOfDay}
            </p>
            <h2 className="text-xl sm:text-2xl text-white font-bold leading-snug text-balance">
              {recommendation.summary}
            </h2>
            <p className="text-sm text-ocean-300/80 leading-relaxed">
              {recommendation.bestTimeWindow}
            </p>
          </div>
          <div className="text-center flex-shrink-0">
            <div className={`sonar-wrapper ${sonarColor(topScore)} inline-block`}>
              <div className={`inline-flex flex-col items-center px-6 py-5 rounded-2xl bg-ocean-950/70 border border-white/[0.06] ${scoreGlow(topScore)}`}>
                <div
                  className={`text-5xl sm:text-6xl font-bold leading-none ${scoreColor(topScore)}`}
                >
                  {siteRankings[0]?.diveScore.overall ?? "—"}
                </div>
                <p className="text-[11px] text-ocean-400 mt-2 font-medium">
                  {siteRankings[0]?.diveScore.label ?? "—"}
                </p>
                <p className="text-[10px] text-ocean-500 mt-0.5">
                  {recommendation.bestSite}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Key factors */}
        <div className="relative z-10 flex flex-wrap gap-2 mt-6 pt-5 border-t border-white/[0.05]">
          {recommendation.keyFactors.map((f, i) => (
            <span
              key={i}
              className="text-[11px] px-3 py-1.5 rounded-full bg-ocean-950/60 text-ocean-300 border border-white/[0.05]"
            >
              {f}
            </span>
          ))}
        </div>
      </section>

      {/* Conditions Strip */}
      <section>
        <SectionHeader title="Current Conditions" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-children">
          <ConditionCard
            icon="~"
            label="Swell"
            value={swell ? `${swell.current.height}m` : "—"}
            sub={swell ? `${swell.current.period}s ${swell.current.direction} · ${swell.trend}` : "Data unavailable"}
          />
          <ConditionCard
            icon=">"
            label="Wind"
            value={obs ? `${obs.windSpeed}kt ${obs.windDirection}` : "—"}
            sub={obs ? `Gusts ${obs.windGust}kt` : "Data unavailable"}
          />
          <ConditionCard
            icon="*"
            label="Water Temp"
            value={
              weather?.seaSurfaceTemp
                ? `${weather.seaSurfaceTemp}°C`
                : "—"
            }
            sub={obs ? `Air ${obs.airTemp}°C` : "Data unavailable"}
          />
          <ConditionCard
            icon="o"
            label="Visibility"
            value={visibility ? `${visibility.metres}m` : "—"}
            sub={visibility ? `${visibility.rating} · ${visibility.confidence} conf.` : "Requires weather + swell"}
          />
          <ConditionCard
            icon="^"
            label="Tide"
            value={weather ? weather.tides.currentState.replace("_", " ") : "—"}
            sub={
              weather?.tides.nextHigh
                ? `High ${formatTime(weather.tides.nextHigh.time)} (${weather.tides.nextHigh.height}m)`
                : "—"
            }
          />
          <ConditionCard
            icon="|"
            label="Rain (48h)"
            value={weather ? `${weather.rainfall.last48h}mm` : "—"}
            sub={weather ? `${weather.rainfall.daysSinceSignificantRain}d since heavy rain` : "Data unavailable"}
          />
        </div>
      </section>

      {/* Visibility factors */}
      {visibility && (
        <section>
          <SectionHeader title="Visibility Breakdown" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 stagger-children">
            {visibility.factors.map((f) => (
              <div
                key={f.name}
                className="glass-card p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-ocean-400">{f.name}</span>
                  <span
                    className={`text-[11px] font-bold ${f.impact > 0 ? "text-emerald-400" : f.impact < 0 ? "text-red-400" : "text-ocean-500"}`}
                  >
                    {f.impact > 0 ? "+" : ""}
                    {f.impact}m
                  </span>
                </div>
                <p className="text-[10px] text-ocean-500 leading-snug">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Site Rankings + Map */}
      <section>
        <SectionHeader title="Site Rankings" subtitle={`${siteRankings.length} sites ranked by conditions`} />
        {siteRankings.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <div className="grid gap-4 sm:grid-cols-2 stagger-children">
              {siteRankings.map((ranking) => (
                <SiteCard key={ranking.site.id} ranking={ranking} conditions={conditions} />
              ))}
            </div>
            <div className="hidden lg:block">
              <SiteMap rankings={siteRankings} />
            </div>
          </div>
        ) : (
          <div className="glass-card p-8 text-center">
            <p className="text-ocean-400 text-sm">Site rankings unavailable — requires weather and swell data</p>
          </div>
        )}
      </section>

      {/* Species Forecast */}
      {siteRankings.length > 0 && (
        <section>
          <SectionHeader
            title="Species Forecast"
            subtitle={`Likelihood at ${siteRankings[0]?.site.name ?? "best site"}`}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
            {(siteRankings[0]?.topSpecies ?? []).map((sp) => (
              <div
                key={sp.name}
                className="glass-card p-4 flex items-center justify-between group"
              >
                <div>
                  <span className="text-sm text-white font-medium">{sp.name}</span>
                  <p className="text-[10px] text-ocean-500 mt-0.5">
                    {sp.regulation}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold px-3 py-1.5 rounded-full ${likelihoodColor(sp.likelihood.score)}`}
                >
                  {sp.likelihood.score}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="text-center pb-10 pt-4">
        <div className="section-divider mb-6" />
        <p className="text-[11px] text-ocean-600">
          Generated {new Date(briefing.generatedAt).toLocaleString("en-AU")} ·
          Weather: {dataStatus?.weather?.source ?? "unknown"} ·
          Swell: {dataStatus?.swell?.source ?? "unknown"}
        </p>
        <p className="text-[11px] text-ocean-700 mt-2">
          Not a safety tool. Always assess conditions yourself before entering the water.
        </p>
      </footer>
    </div>
  );
}

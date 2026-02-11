export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Hero: Overall Dive Score */}
      <section className="rounded-2xl bg-ocean-900/60 border border-ocean-800 p-6 sm:p-8 text-center">
        <p className="text-sm uppercase tracking-wider text-ocean-400 mb-2">
          Tomorrow&apos;s Dive Score
        </p>
        <div className="text-7xl font-bold text-teal-400 mb-2">—</div>
        <p className="text-ocean-300 text-lg">
          Conditions data coming soon
        </p>
        <span className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
          Awaiting data sources
        </span>
      </section>

      {/* Conditions Strip */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Current Conditions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Swell", value: "— m", sub: "—s —" },
            { label: "Wind", value: "— kts", sub: "—" },
            { label: "Water Temp", value: "—°C", sub: "—" },
            { label: "Visibility", value: "— m", sub: "—" },
            { label: "Tide", value: "—", sub: "—" },
            { label: "Rain (48h)", value: "— mm", sub: "—" },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl bg-ocean-900/40 border border-ocean-800 p-4"
            >
              <p className="text-xs text-ocean-400 mb-1">{card.label}</p>
              <p className="text-xl font-semibold text-white">{card.value}</p>
              <p className="text-xs text-ocean-500 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Map Placeholder */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Dive Sites — Northern Beaches
        </h2>
        <div className="rounded-xl bg-ocean-900/40 border border-ocean-800 h-80 flex items-center justify-center">
          <p className="text-ocean-500">
            Mapbox map will render here — configure NEXT_PUBLIC_MAPBOX_TOKEN
          </p>
        </div>
      </section>

      {/* Site Rankings Placeholder */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Site Rankings
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Long Reef",
            "Freshwater Headland",
            "Narrabeen Head",
            "Dee Why Head",
            "Curl Curl Headland",
            "North Head",
          ].map((site) => (
            <div
              key={site}
              className="rounded-xl bg-ocean-900/40 border border-ocean-800 p-4"
            >
              <p className="font-medium text-white">{site}</p>
              <p className="text-sm text-ocean-400 mt-1">
                Ranking data pending
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Species Forecast Placeholder */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Species Forecast
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            "Kingfish",
            "Bonito",
            "Snapper",
            "Cobia",
            "Flathead",
            "Trevally",
            "Mulloway",
          ].map((species) => (
            <div
              key={species}
              className="rounded-xl bg-ocean-900/40 border border-ocean-800 p-3 flex items-center justify-between"
            >
              <span className="text-sm text-white">{species}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-ocean-800 text-ocean-400">
                —
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Safety Panel Placeholder */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ocean-400 mb-3">
          Safety
        </h2>
        <div className="rounded-xl bg-ocean-900/40 border border-ocean-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-white">Shark Risk</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-ocean-800 text-ocean-400">
              Awaiting data
            </span>
          </div>
          <p className="text-sm text-ocean-400">
            Recent alerts, conditions safety, and emergency info will appear
            here.
          </p>
        </div>
      </section>
    </div>
  );
}

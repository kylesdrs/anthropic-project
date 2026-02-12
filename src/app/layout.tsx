import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterSW from "./components/RegisterSW";
import InstallPrompt from "./components/InstallPrompt";

export const viewport: Viewport = {
  themeColor: "#041A19",
};

export const metadata: Metadata = {
  title: "Sydney Spearfishing Intel",
  description:
    "Live dive conditions, site rankings, and species forecasts for Sydney's Northern Beaches",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Spearo Intel",
  },
};

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.04] bg-[#041A19]/75 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center h-20 sm:h-24">
          <div className="flex items-center gap-4">
            <img
              src="/kingfish-logo.png"
              alt="Kingfish logo"
              className="h-14 w-14 sm:h-16 sm:w-16 object-contain"
            />
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
                Spearo Intel
              </h1>
              <p className="text-xs sm:text-sm text-ocean-400 leading-tight">
                Sydney Northern Beaches
              </p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 self-start mt-1">
              Live
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/kingfish-logo.png" />
        <link rel="apple-touch-icon" href="/kingfish-logo.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-[#041A19] text-ocean-100 min-h-screen antialiased">
        {/* Directional depth layers */}
        <div className="depth-highlight" aria-hidden="true" />
        <div className="depth-shadow" aria-hidden="true" />
        <div className="grain-overlay" aria-hidden="true" />
        <div className="contour-overlay" aria-hidden="true">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 1440 900">
            <defs>
              {/* Flowing horizontal wave pattern — resembles underwater currents */}
              <pattern id="wave-current" width="360" height="180" patternUnits="userSpaceOnUse">
                <path d="M0,30 C60,18 120,42 180,30 C240,18 300,42 360,30" fill="none" stroke="rgba(22,90,79,0.35)" strokeWidth="0.6"/>
                <path d="M0,60 C90,48 150,72 240,60 C330,48 360,65 360,60" fill="none" stroke="rgba(11,59,54,0.30)" strokeWidth="0.5"/>
                <path d="M0,90 C70,80 140,100 210,90 C280,80 350,100 360,90" fill="none" stroke="rgba(22,90,79,0.25)" strokeWidth="0.5"/>
                <path d="M0,120 C80,112 160,128 240,120 C320,112 360,125 360,120" fill="none" stroke="rgba(14,77,69,0.28)" strokeWidth="0.4"/>
                <path d="M0,150 C100,140 200,160 300,150 C350,145 360,152 360,150" fill="none" stroke="rgba(11,59,54,0.22)" strokeWidth="0.4"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#wave-current)"/>
          </svg>
        </div>
        <RegisterSW />
        <InstallPrompt />
        <Header />
        <main className="relative z-10 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-10">
          {children}
        </main>
      </body>
    </html>
  );
}

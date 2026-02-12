import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterSW from "./components/RegisterSW";

export const viewport: Viewport = {
  themeColor: "#060e1a",
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
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-ocean-950/70 backdrop-blur-xl">
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
      <body className="bg-ocean-950 text-ocean-100 min-h-screen antialiased">
        <div className="grain-overlay" aria-hidden="true" />
        <div className="contour-overlay" aria-hidden="true">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <defs>
              <pattern id="contour" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)">
                <path d="M0,60 Q30,45 60,60 Q90,75 120,60" fill="none" stroke="rgba(45,212,191,0.5)" strokeWidth="0.5"/>
                <path d="M0,30 Q30,15 60,30 Q90,45 120,30" fill="none" stroke="rgba(0,152,204,0.4)" strokeWidth="0.5"/>
                <path d="M0,90 Q30,75 60,90 Q90,105 120,90" fill="none" stroke="rgba(0,152,204,0.3)" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#contour)"/>
          </svg>
        </div>
        <RegisterSW />
        <Header />
        <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {children}
        </main>
      </body>
    </html>
  );
}

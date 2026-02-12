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
        <RegisterSW />
        <Header />
        <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

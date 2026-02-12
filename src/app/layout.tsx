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
        <div className="flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-2.5">
            <img
              src="/kingfish-logo.png"
              alt="Kingfish logo"
              className="h-8 w-8 sm:h-9 sm:w-9 object-contain"
            />
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Spearo Intel
              </h1>
              <p className="text-[10px] sm:text-xs text-ocean-400 leading-tight hidden sm:block">
                Sydney Northern Beaches
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
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
        <RegisterSW />
        <Header />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterSW from "./components/RegisterSW";

export const viewport: Viewport = {
  themeColor: "#0a1628",
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
    <header className="border-b border-ocean-800 bg-ocean-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <span className="text-2xl" role="img" aria-label="Spearfishing">
              🤿
            </span>
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Sydney Spearfishing Intel
            </h1>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-ocean-300">
            <a href="/" className="hover:text-teal-400 transition-colors">
              Dashboard
            </a>
            <a
              href="/sites"
              className="hover:text-teal-400 transition-colors"
            >
              Sites
            </a>
            <a
              href="/briefing"
              className="hover:text-teal-400 transition-colors"
            >
              Briefing
            </a>
          </nav>
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
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-ocean-950 text-ocean-100 min-h-screen antialiased">
        <RegisterSW />
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

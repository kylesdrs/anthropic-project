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
        <div className="flex items-center justify-center h-16">
          <div className="flex items-center gap-3">
            <img src="/kingfish-logo.png" alt="Kingfish logo" className="h-10 w-10 object-contain" />
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              Sydney Spearfishing Intel — Daily Briefing
            </h1>
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed as standalone
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if previously dismissed this session
    if (sessionStorage.getItem("install-dismissed")) return;

    // Android / Desktop Chrome: capture the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: detect and show manual instructions
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
    if (isIOS && isSafari) {
      setShowIOSPrompt(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSPrompt(false);
    sessionStorage.setItem("install-dismissed", "1");
  }

  // Nothing to show
  if (dismissed) return null;
  if (!deferredPrompt && !showIOSPrompt) return null;

  return (
    <div className="fixed bottom-4 left-3 right-3 z-50 animate-fade-in-up sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="glass-card border-teal-500/20 p-4 shadow-lg shadow-black/30">
        <div className="flex items-start gap-3">
          <img
            src="/kingfish-logo.png"
            alt=""
            className="w-10 h-10 rounded-xl flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              Install Spearo Intel
            </p>
            {deferredPrompt ? (
              <>
                <p className="text-[11px] text-ocean-400 mt-0.5 leading-snug">
                  Add to your home screen for quick access to live conditions.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleInstall}
                    className="px-4 py-1.5 rounded-lg bg-teal-500/20 text-teal-400 text-xs font-medium border border-teal-500/30 hover:bg-teal-500/30 transition-colors"
                  >
                    Install
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 rounded-lg text-ocean-500 text-xs hover:text-ocean-300 transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-ocean-400 mt-0.5 leading-snug">
                  Tap{" "}
                  <span className="inline-block px-1 py-0.5 bg-ocean-800/60 rounded text-ocean-300 text-[10px] font-mono align-middle">
                    Share
                  </span>{" "}
                  then{" "}
                  <span className="inline-block px-1 py-0.5 bg-ocean-800/60 rounded text-ocean-300 text-[10px] font-mono align-middle">
                    Add to Home Screen
                  </span>{" "}
                  to install.
                </p>
                <button
                  onClick={handleDismiss}
                  className="mt-2 text-[11px] text-ocean-500 hover:text-ocean-300 transition-colors"
                >
                  Got it
                </button>
              </>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-ocean-600 hover:text-ocean-400 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  FormEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number; // Date.now()
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STARTER_PROMPTS = [
  "Dive today?",
  "Best day this week?",
  "Check against Abyss",
  "Shark alerts near me",
  "Explain the vis score",
];

const SWIPE_CLOSE_THRESHOLD = 100; // px drag-down to close

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function hapticTap() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // not supported
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true when the user has scrolled up manually
  const [userScrolled, setUserScrolled] = useState(false);
  const [showNewMsg, setShowNewMsg] = useState(false);
  // swipe-to-close drag offset
  const [dragY, setDragY] = useState(0);
  // keyboard-aware panel height on mobile
  const [viewportH, setViewportH] = useState<number | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartY = useRef<number | null>(null);

  // Re-render relative timestamps every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isOpen || messages.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [isOpen, messages.length]);

  /* ---------- keyboard / viewport handling ---------- */

  useEffect(() => {
    if (!isOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      setViewportH(vv.height);
      // scroll latest message into view after keyboard opens
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    };
    vv.addEventListener("resize", onResize);
    // set initial
    setViewportH(vv.height);
    return () => vv.removeEventListener("resize", onResize);
  }, [isOpen]);

  /* ---------- auto-scroll ---------- */

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowNewMsg(false);
    setUserScrolled(false);
  }, []);

  // detect if user scrolled away from bottom
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) {
      setUserScrolled(false);
      setShowNewMsg(false);
    } else {
      setUserScrolled(true);
    }
  }, []);

  // auto-scroll on new messages (unless user scrolled up)
  useEffect(() => {
    if (userScrolled) {
      // show "new message" pill instead of scrolling
      if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
        setShowNewMsg(true);
      }
    } else {
      scrollToBottom();
    }
  }, [messages, userScrolled, scrollToBottom]);

  /* ---------- focus input when chat opens ---------- */

  useEffect(() => {
    if (isOpen) {
      // small delay so the panel animation finishes
      const id = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // keep input focused after sending
  useEffect(() => {
    if (!isStreaming && isOpen) {
      inputRef.current?.focus();
    }
  }, [isStreaming, isOpen]);

  /* ---------- swipe to close ---------- */

  const onTouchStart = (e: ReactTouchEvent) => {
    // only from the drag handle area (first 48px of the panel)
    const target = e.target as HTMLElement;
    if (!target.closest("[data-drag-handle]")) return;
    dragStartY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, dy)); // only allow downward
  };

  const onTouchEnd = () => {
    if (dragY > SWIPE_CLOSE_THRESHOLD) {
      setIsOpen(false);
    }
    setDragY(0);
    dragStartY.current = null;
  };

  /* ---------- send message ---------- */

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      hapticTap();
      setError(null);
      setUserScrolled(false);
      setShowNewMsg(false);

      const userMsg: ChatMessage = {
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsStreaming(true);

      // keep keyboard open
      requestAnimationFrame(() => inputRef.current?.focus());

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history: messages.slice(-10).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Request failed");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let assistantText = "";
        const assistantTs = Date.now();

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "", timestamp: assistantTs },
        ]);

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") break;

            try {
              const parsed = JSON.parse(payload);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.text) {
                assistantText += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantText,
                    timestamp: assistantTs,
                  };
                  return updated;
                });
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Chat unavailable — API key not configured";
        setError(msg);
        setMessages((prev) =>
          prev.length > 0 &&
          prev[prev.length - 1].role === "assistant" &&
          !prev[prev.length - 1].content
            ? prev.slice(0, -1)
            : prev
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  /* ---------- panel height for mobile keyboard avoidance ---------- */
  const mobileHeight =
    viewportH !== null ? `${viewportH}px` : "100dvh";

  return (
    <>
      {/* ---- FAB ---- */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full transition-all duration-300
          h-14 w-14 shadow-lg shadow-emerald-900/30
          ${
            isOpen
              ? "bg-ocean-700 rotate-0 scale-95"
              : "bg-ocean-600 hover:bg-ocean-500 hover:scale-105"
          }`}
        style={{
          boxShadow: isOpen
            ? undefined
            : "0 0 20px rgba(42,142,124,0.25), 0 4px 12px rgba(0,0,0,0.3)",
        }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? (
          <svg
            className="h-6 w-6 text-ocean-100"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="h-6 w-6 text-ocean-100"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>

      {/* ---- Backdrop (mobile only) ---- */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ---- Chat panel ---- */}
      {isOpen && (
        <div
          className="fixed z-50 flex flex-col bg-ocean-950/[0.97] backdrop-blur-xl border border-ocean-700/30 shadow-2xl
            inset-0 sm:inset-auto sm:bottom-24 sm:right-5 sm:rounded-2xl
            sm:w-[400px] sm:h-[500px] sm:max-h-[80vh]"
          style={{
            // mobile: use visualViewport height to dodge keyboard
            height: viewportH !== null ? mobileHeight : undefined,
            // swipe offset
            transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
            transition: dragY > 0 ? "none" : "transform 0.3s ease",
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* ---- Drag handle (mobile) ---- */}
          <div
            data-drag-handle
            className="flex items-center justify-center pt-2 pb-1 sm:hidden cursor-grab active:cursor-grabbing"
          >
            <div className="w-10 h-1 rounded-full bg-ocean-600/60" />
          </div>

          {/* ---- Header ---- */}
          <div className="flex items-center justify-between px-4 py-2 sm:py-3 border-b border-ocean-800/50">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-ocean-100">
                Ask Spearo Intel
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-ocean-400 hover:text-ocean-200 transition-colors sm:hidden p-1"
              aria-label="Close chat"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* ---- Messages ---- */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-4 overscroll-contain"
          >
            {/* Starter prompts — only before any conversation */}
            {messages.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-2">
                <p className="text-ocean-300 text-base sm:text-sm">
                  Ask anything about conditions, sites, or diving.
                </p>
                <div className="flex gap-2 overflow-x-auto max-w-full pb-2 no-scrollbar">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      disabled={isStreaming}
                      className="flex-shrink-0 text-sm sm:text-xs px-4 py-2 sm:px-3 sm:py-1.5 rounded-full
                        border border-ocean-600/50 text-ocean-200
                        hover:bg-ocean-800/60 hover:border-ocean-500/60
                        active:bg-ocean-700/60
                        transition-all disabled:opacity-50 whitespace-nowrap"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap
                    text-base sm:text-[15px] leading-relaxed
                    ${
                      msg.role === "user"
                        ? "bg-emerald-900/60 text-ocean-50 rounded-br-md"
                        : "bg-ocean-800/40 border border-ocean-700/20 text-ocean-100 rounded-bl-md"
                    }`}
                >
                  {msg.content}
                  {msg.role === "assistant" &&
                    !msg.content &&
                    isStreaming && <PulsingDots />}
                </div>
                <span className="text-[11px] text-ocean-500/60 mt-1 px-1">
                  {relativeTime(msg.timestamp)}
                </span>
              </div>
            ))}

            {error && (
              <div className="text-center text-sm sm:text-xs text-red-400/80 py-2">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ---- "New message" pill ---- */}
          {showNewMsg && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
              <button
                onClick={scrollToBottom}
                className="px-3 py-1.5 rounded-full bg-ocean-700/90 border border-ocean-600/40
                  text-xs text-ocean-200 shadow-lg backdrop-blur-sm
                  animate-bounce"
              >
                New message
              </button>
            </div>
          )}

          {/* ---- Input bar ---- */}
          <form
            onSubmit={handleSubmit}
            className="sticky bottom-0 flex items-center gap-2 px-3 py-3
              border-t border-ocean-800/50 bg-ocean-950/[0.97]"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about conditions..."
                disabled={isStreaming}
                className="w-full rounded-xl bg-ocean-900/50 border border-ocean-700/30
                  pl-4 pr-11 py-2.5
                  text-base sm:text-sm text-ocean-100 placeholder-ocean-500
                  focus:outline-none focus:border-ocean-500/50 focus:ring-1 focus:ring-ocean-500/20
                  disabled:opacity-50 transition-colors"
              />
              {/* Send button inside input */}
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2
                  flex h-8 w-8 items-center justify-center rounded-lg
                  bg-ocean-600 hover:bg-ocean-500 active:bg-ocean-400
                  disabled:opacity-20 disabled:hover:bg-ocean-600
                  transition-all"
                aria-label="Send message"
              >
                <svg
                  className="h-4 w-4 text-ocean-100"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PulsingDots() {
  return (
    <span className="inline-flex gap-1 ml-0.5">
      <span
        className="h-1.5 w-1.5 rounded-full bg-ocean-400 animate-[pulse-dot_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-ocean-400 animate-[pulse-dot_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: "200ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-ocean-400 animate-[pulse-dot_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: "400ms" }}
      />
    </span>
  );
}

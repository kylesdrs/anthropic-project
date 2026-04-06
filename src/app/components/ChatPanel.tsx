"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTER_PROMPTS = [
  "Should I dive today?",
  "What's vis like at Long Reef right now?",
  "Cross-check our forecast against Abyss",
  "Any shark activity near Manly?",
  "When's the best day this week?",
];

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isStreaming) {
      inputRef.current?.focus();
    }
  }, [isOpen, isStreaming]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      setError(null);
      const userMsg: ChatMessage = { role: "user", content: text.trim() };
      const history = [...messages, userMsg];
      setMessages(history);
      setInput("");
      setIsStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history: messages.slice(-10),
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

        // Add empty assistant message to fill via streaming
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

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
          err instanceof Error ? err.message : "Chat unavailable — API key not configured";
        setError(msg);
        // Remove the empty assistant message if we added one
        setMessages((prev) =>
          prev.length > 0 && prev[prev.length - 1].role === "assistant" && !prev[prev.length - 1].content
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

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
          isOpen
            ? "bg-ocean-700 scale-90 rotate-90"
            : "bg-ocean-600 hover:bg-ocean-500 hover:scale-105"
        }`}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? (
          <svg className="h-6 w-6 text-ocean-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6 text-ocean-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed z-40 flex flex-col bg-ocean-950/95 backdrop-blur-xl border border-ocean-700/40 shadow-2xl
          bottom-0 right-0 sm:bottom-24 sm:right-5 sm:rounded-2xl
          w-full h-full sm:w-[420px] sm:h-[600px] sm:max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ocean-800/60">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-ocean-100">Ask Spearo Intel</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-ocean-400 hover:text-ocean-200 transition-colors sm:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
            {messages.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <p className="text-ocean-300 text-sm">
                  Ask anything about conditions, sites, or diving the Northern Beaches.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      disabled={isStreaming}
                      className="text-xs px-3 py-1.5 rounded-full border border-ocean-600/50 text-ocean-200 hover:bg-ocean-800/60 hover:border-ocean-500/60 transition-all disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-ocean-600/60 text-ocean-50 rounded-br-md"
                      : "bg-ocean-800/50 text-ocean-100 rounded-bl-md"
                  }`}
                >
                  {msg.content}
                  {msg.role === "assistant" && !msg.content && isStreaming && (
                    <span className="inline-flex gap-1 ml-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-ocean-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-ocean-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-ocean-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="text-center text-xs text-red-400/80 py-2">{error}</div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 px-3 py-3 border-t border-ocean-800/60"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about conditions..."
              disabled={isStreaming}
              className="flex-1 rounded-xl bg-ocean-900/60 border border-ocean-700/40 px-3.5 py-2 text-sm text-ocean-100 placeholder-ocean-500 focus:outline-none focus:border-ocean-500/60 focus:ring-1 focus:ring-ocean-500/30 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-ocean-600 hover:bg-ocean-500 disabled:opacity-30 disabled:hover:bg-ocean-600 transition-all"
              aria-label="Send message"
            >
              <svg className="h-4 w-4 text-ocean-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { callAgentTalk, EdgeFunctionError } from "@/lib/edgeFunctions";

type ChatMessage = { role: "user" | "assistant"; content: string };

/* Public, unauthenticated page — this is the link a Deploy-tab account
   pastes into an email or SMS. No AuthProvider/AppShell here on purpose
   (this route sits outside the (app) segment): whoever opens it has no
   account and needs none. Global styles (app.css's .btn/.input/.panel)
   still apply since RootLayout imports them for every route. */
export default function TalkPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const history = messages;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    scrollToBottom();

    try {
      const { reply } = await callAgentTalk({ slug, message: text, history });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      if (err instanceof EdgeFunctionError && err.code === "not_found") {
        setFatalError("This onboarding link isn't active. Ask whoever sent it to check the Deploy tab.");
      } else if (err instanceof EdgeFunctionError && err.code === "unavailable") {
        setMessages((prev) => [...prev, { role: "assistant", content: "This onboarding agent is temporarily unavailable. Please try again in a bit." }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong sending that — try again?" }]);
      }
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  if (fatalError) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div className="panel">
          <p>{fatalError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 16 }}>
        <span className="pp-label">Onboarding</span>
        <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>Let&apos;s get you set up</h1>
        <p className="panel-sub" style={{ marginTop: 4 }}>Answer a few questions and we&apos;ll take it from here.</p>
      </div>

      <div
        ref={listRef}
        className="panel"
        style={{ flex: 1, minHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}
      >
        {messages.length === 0 && (
          <p className="panel-sub">Say hello to get started.</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              background: m.role === "user" ? "var(--primary)" : "var(--surface-2)",
              color: m.role === "user" ? "#fff" : "var(--ink)",
              border: m.role === "user" ? "none" : "1px solid var(--border)",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 14,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: "flex-start", color: "var(--ink-3)", fontSize: 13 }}>Thinking…</div>
        )}
      </div>

      <form onSubmit={handleSend} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          className="input"
          placeholder="Type your message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          autoFocus
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
          <span className="btn-label">Send</span>
        </button>
      </form>
    </div>
  );
}

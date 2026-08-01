"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { callAgentTalk, EdgeFunctionError } from "@/lib/edgeFunctions";

type ChatMessage = { role: "user" | "assistant"; content: string };

/* Minimal typings for the Web Speech API — not in TS's DOM lib. Same
   feature the in-app call-capture (useCallCapture) is built on:
   Chrome/Edge (+ recent iOS Safari) expose webkitSpeechRecognition. */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* Prefer the platform's best English voice: Edge's neural "Natural"
   voices, then Google's, then any en-*. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return (
    voices.find((v) => v.lang.startsWith("en") && v.name.includes("Natural")) ??
    voices.find((v) => v.lang.startsWith("en") && v.name.includes("Google")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

function sessionStorageKey(slug: string) {
  return `bsl_talk_session:${slug}`;
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

/* Public, unauthenticated page — this is the link a Deploy-tab account
   pastes into an email or SMS. No AuthProvider/AppShell here on purpose
   (this route sits outside the (app) segment): whoever opens it has no
   account and needs none.

   Two ways to talk to the agent, one pipeline: typed chat, or VOICE
   MODE — browser speech-to-text captures the visitor, the reply comes
   back through the same agent-talk function, and speech synthesis reads
   it aloud, then listening resumes for a hands-free conversation.
   Credits, session logging, and webhooks all behave identically in
   both modes because the transport is unchanged. */
export default function TalkPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ended, setEnded] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);

  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceModeRef = useRef(false);
  const endedRef = useRef(false);
  // The freshest transcript, readable inside recognition callbacks.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    const key = sessionStorageKey(slug);
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    sessionIdRef.current = id;
    setVoiceSupported(getRecognitionCtor() !== null && "speechSynthesis" in window);
    // Some browsers populate the voice list asynchronously — warm it up.
    window.speechSynthesis?.getVoices();

    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, [slug]);

  // Fetch the assistant's display name + configured opening line and
  // seed the greeting, so the conversation starts the way its owner
  // wrote it. Best-effort: on any failure the page just keeps the
  // generic header and waits for the visitor to open.
  useEffect(() => {
    let cancelled = false;
    callAgentTalk<{ name: string; firstMessage: string }>({ slug, action: "init" })
      .then(({ name, firstMessage }) => {
        if (cancelled) return;
        if (name) setAgentName(name);
        const greeting = (firstMessage ?? "").trim();
        if (greeting) {
          setMessages((prev) => (prev.length === 0 ? [{ role: "assistant", content: greeting }] : prev));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // A closed/abandoned tab must still deliver the conversation to the
  // owner's CRM — "End chat" is a courtesy, not the only trigger.
  // sendBeacon survives page teardown; text/plain keeps it a simple
  // request (beacons can't preflight), and agent-talk parses the body
  // as JSON regardless of content-type.
  useEffect(() => {
    function onPageHide() {
      if (endedRef.current) return;
      if (!messagesRef.current.some((m) => m.role === "user")) return;
      endedRef.current = true;
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/agent-talk`;
      const payload = JSON.stringify({ slug, action: "end", sessionId: sessionIdRef.current ?? undefined });
      const sent = navigator.sendBeacon?.(url, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
      if (!sent) {
        fetch(url, {
          method: "POST",
          body: payload,
          keepalive: true,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        }).catch(() => {});
      }
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [slug]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  /* ---------- shared send pipeline (typed or spoken) ---------- */

  async function sendText(text: string): Promise<string | null> {
    const history = messagesRef.current;
    setMessages([...history, { role: "user", content: text }]);
    setSending(true);
    scrollToBottom();

    try {
      const { reply } = await callAgentTalk({
        slug,
        message: text,
        history,
        sessionId: sessionIdRef.current ?? undefined,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      return reply;
    } catch (err) {
      let fallback = "Something went wrong sending that — try again?";
      if (err instanceof EdgeFunctionError && err.code === "not_found") {
        setFatalError("This onboarding link isn't active. Ask whoever sent it to check the Deploy tab.");
        return null;
      }
      if (err instanceof EdgeFunctionError && err.code === "unavailable") {
        fallback = "This onboarding agent is temporarily unavailable. Please try again in a bit.";
      }
      if (err instanceof EdgeFunctionError && err.code === "session_mismatch") {
        const fresh = crypto.randomUUID();
        sessionStorage.setItem(sessionStorageKey(slug), fresh);
        sessionIdRef.current = fresh;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: fallback }]);
      return null;
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || ended) return;
    setInput("");
    await sendText(text);
  }

  /* ---------- voice mode ---------- */

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      resumeListening();
      return;
    }
    setVoiceState("speaking");
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.02;
    // Listening resumes only AFTER speech finishes — a live mic during
    // playback would transcribe the agent's own voice back at it.
    utterance.onend = () => resumeListening();
    utterance.onerror = () => resumeListening();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function resumeListening() {
    if (!voiceModeRef.current || endedRef.current) {
      setVoiceState("idle");
      return;
    }
    startListening();
  }

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    recognitionRef.current?.abort();

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = "en-US";
    rec.continuous = false; // one utterance per turn
    rec.interimResults = true;

    let finalText = "";
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }
      setInterim(interimText || finalText);
    };
    rec.onerror = (e) => {
      setInterim("");
      // "no-speech" just means silence — quietly re-arm; real failures
      // (mic denied, network) drop back to typed chat.
      if (e.error === "no-speech" || e.error === "aborted") return;
      voiceModeRef.current = false;
      setVoiceMode(false);
      setVoiceState("idle");
    };
    rec.onend = async () => {
      setInterim("");
      if (!voiceModeRef.current || endedRef.current) {
        setVoiceState("idle");
        return;
      }
      const text = finalText.trim();
      if (!text) {
        // Silence window elapsed — listen again.
        startListening();
        return;
      }
      setVoiceState("thinking");
      const reply = await sendText(text);
      if (reply && voiceModeRef.current && !endedRef.current) {
        speak(reply);
      } else {
        resumeListening();
      }
    };

    setVoiceState("listening");
    try {
      rec.start();
    } catch {
      setVoiceState("idle");
    }
  }

  function enterVoiceMode() {
    voiceModeRef.current = true;
    setVoiceMode(true);
    startListening();
  }

  function exitVoiceMode() {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setVoiceState("idle");
    setInterim("");
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }

  async function handleEnd() {
    // The seeded greeting alone isn't a conversation — only end (and
    // dispatch) once the visitor actually said something.
    if (ended || !messages.some((m) => m.role === "user")) return;
    endedRef.current = true;
    setEnded(true);
    exitVoiceMode();
    try {
      await callAgentTalk({ slug, action: "end", sessionId: sessionIdRef.current ?? undefined });
    } catch {
      // Ending is a courtesy signal — nothing for the visitor to fix.
    }
    sessionStorage.removeItem(sessionStorageKey(slug));
  }

  /* ---------- render ---------- */

  if (fatalError) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div className="panel">
          <p>{fatalError}</p>
        </div>
      </div>
    );
  }

  const voiceLabel: Record<VoiceState, string> = {
    idle: "Tap to talk",
    listening: "Listening… speak naturally",
    thinking: "Thinking…",
    speaking: "Speaking — hang on",
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <span className="pp-label">{agentName ?? "Onboarding"}</span>
          <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>Let&apos;s get you set up</h1>
          <p className="panel-sub" style={{ marginTop: 4 }}>
            {voiceMode ? "Talk it through — hands-free." : "Answer a few questions and we'll take it from here."}
          </p>
        </div>
        {messages.some((m) => m.role === "user") && !ended && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleEnd}>
            End chat
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className="panel"
        style={{ flex: 1, minHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}
      >
        {messages.length === 0 && (
          <p className="panel-sub">
            {voiceMode ? "Say hello to get started." : voiceSupported ? "Say hello to get started — type below, or use voice." : "Say hello to get started."}
          </p>
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
        {interim && (
          <div style={{ alignSelf: "flex-end", maxWidth: "80%", color: "var(--ink-3)", fontSize: 14, fontStyle: "italic" }}>
            {interim}
          </div>
        )}
        {sending && !voiceMode && (
          <div style={{ alignSelf: "flex-start", color: "var(--ink-3)", fontSize: 13 }}>Thinking…</div>
        )}
        {ended && (
          <div style={{ alignSelf: "center", color: "var(--ink-3)", fontSize: 13, marginTop: 8 }}>
            Chat ended — thanks for your time!
          </div>
        )}
      </div>

      {voiceMode && !ended ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={exitVoiceMode}
            aria-label="Stop voice mode"
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              background: voiceState === "listening" ? "var(--primary)" : "var(--surface-2)",
              color: voiceState === "listening" ? "#fff" : "var(--ink)",
              boxShadow: voiceState === "listening" ? "0 0 0 8px rgba(124, 108, 255, 0.25)" : "none",
              transition: "box-shadow 0.3s ease, background 0.3s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-10" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
          <span className="panel-sub" style={{ fontSize: 13 }} role="status" aria-live="polite">
            {voiceLabel[voiceState]} · tap the mic to switch back to typing
          </span>
        </div>
      ) : (
        <form onSubmit={handleSend} style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            className="input"
            placeholder={ended ? "This chat has ended" : "Type your message…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending || ended}
            autoFocus
          />
          {voiceSupported && !ended && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={enterVoiceMode}
              disabled={sending}
              aria-label="Switch to voice conversation"
              title="Talk instead of typing"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={sending || ended || !input.trim()}>
            <span className="btn-label">Send</span>
          </button>
        </form>
      )}
    </div>
  );
}

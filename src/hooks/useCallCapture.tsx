"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { useActivityLog } from "./useActivityLog";
import { useMemory } from "./useMemory";
import { useToast } from "@/components/app/ToastProvider";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";

/* ============================================================
   AGENT. Live call transcript + auto-filled summary
   Direct replacement for js/app.js's AGENT section (lines
   1035-1632): captures a transcript from the browser's Web
   Speech API while a voice-widget call runs, and heuristically
   extracts business/offer/audience/goal/voice from it.
   ============================================================ */

/* ---- minimal Web Speech API shim (no official TS lib types) ---- */
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SRAlternative;
}
interface SRResultList {
  readonly length: number;
  [index: number]: SRResult;
}
interface SREvent extends Event {
  readonly resultIndex: number;
  readonly results: SRResultList;
}
interface SRErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SREvent) => unknown) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SRErrorEvent) => unknown) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
  interface Navigator {
    brave?: unknown;
  }
}

/* ---- data contract (do not deviate: other routes depend on this) ---- */
export type CallLine = { t: number; text: string };
export type CallSummary = {
  business?: string;
  offer?: string;
  audience?: string;
  goal?: string;
  voice?: string;
};
export type Call = { lines: CallLine[]; duration: number; when: string | null; summary: CallSummary };
export type CallLog = {
  id: string;
  when: string;
  duration: number;
  lines: CallLine[];
  business: string;
  summary: CallSummary;
};

export const CAPS = ["business", "offer", "audience", "goal", "voice"] as const;
export type CapKey = (typeof CAPS)[number];
export const ONB_LABELS: Record<CapKey, string> = {
  business: "Business",
  offer: "Offer",
  audience: "Audience",
  goal: "Goal",
  voice: "Brand voice",
};

export function fmtTime(s: number) {
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}

export function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function makeLog(c: Call): CallLog {
  return {
    id: "log-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    when: c.when || new Date().toISOString(),
    duration: c.duration,
    lines: c.lines,
    business: (c.summary && c.summary.business) || "",
    summary: JSON.parse(JSON.stringify(c.summary || {})),
  };
}

/* ---- heuristic pattern-matching extractors (static demo, no backend AI).
   Ported verbatim from js/app.js — calibrated product logic, do not
   simplify or "improve" the regexes. Only fills fields that are still
   empty, so earlier captures always win. ---- */
type Extractor = { key: CapKey; res: RegExp[]; reject?: RegExp };

const EXTRACTORS: Extractor[] = [
  {
    key: "business",
    res: [
      /(?:business|company|brand|agency|studio|practice|shop|store) (?:is called|is named|name is|is)\s+([\w][\w\s&'’-]{1,60})/i,
      /(?:it'?s|it is) called\s+([\w][\w\s&'’-]{1,60})/i,
      /(?:i|we) (?:run|own|manage|founded|started) (?:a |an )?(?:business|company|brand|agency|studio|practice)? ?called\s+([\w][\w\s&'’-]{1,60})/i,
      /(?:i'?m|i am) the (?:owner|founder|ceo) of\s+([\w][\w\s&'’-]{1,60})/i,
      /(?:this is|i'?m|i am) [\w\s]{2,30} (?:from|of|at)\s+([A-Z][\w\s&'’-]{1,60})/,
    ],
    reject: /^(a|an|the|about|selling|helping|coaching|doing|in|to|just)\b/i,
  },
  {
    key: "offer",
    res: [
      /(?:my|our) (?:main |core )?(?:offer|service|product|program|package) is\s+(.{3,90})/i,
      /(?:we|i) (?:sell|offer|provide|specialize in|specialise in)\s+(.{3,90})/i,
      /(?:my|our) business is\s+((?:selling|helping|coaching|training|teaching|making|building|designing|offering).{3,80})/i,
      /what (?:we|i) (?:do|offer) is\s+(.{3,90})/i,
    ],
  },
  {
    key: "audience",
    res: [
      /(?:my|our) (?:customers?|clients?|audience|target market|ideal (?:clients?|customers?)) (?:are|is|would be)(?: mostly| mainly| typically| usually)?\s+(.{3,90})/i,
      /(?:we|i) (?:work with|serve|focus on|cater to)\s+(.{3,90})/i,
      /(?:we|i)(?:'re| are)? target(?:ing)?\s+(.{3,90})/i,
      /(?:aimed at|geared toward[s]?|designed for)\s+(.{3,90})/i,
      /(?:we|i) help\s+([^,.]{3,60}?)\s+(?:to |with |by |get |grow |build |find |book |make |lose |save )/i,
    ],
  },
  {
    key: "goal",
    res: [
      /(?:my|our) (?:main |big |number one |primary )?(?:goal|objective|aim) is (?:to\s+)?(.{3,90})/i,
      /(?:i|we)(?:'m|'re| am| are) (?:trying|looking|hoping|aiming) to\s+(.{3,90})/i,
      /(?:i|we) (?:really )?(?:want|need|would like|'d like|hope) to\s+(.{3,90})/i,
      /success (?:for us |for me )?(?:looks like|means|would be)\s+(.{3,90})/i,
    ],
  },
  {
    key: "voice",
    res: [
      /(?:brand )?(?:voice|tone)(?: of voice)? (?:is|should be|needs to be|should feel|to be)\s+(.{3,60})/i,
      /keep (?:the |our )?(?:tone|voice|copy|messaging)\s+(.{3,60})/i,
      /(?:we|i) (?:want to |like to )?sound\s+(.{3,60})/i,
    ],
  },
];

function cleanValue(v: string) {
  v = v.replace(/[.,;!?]+\s*$/, "").replace(/\s+/g, " ").trim();
  if (v.length > 90) v = v.slice(0, 90).replace(/\s+\S*$/, "").trim();
  return v;
}

export type CaptureStatusTone = "idle" | "recording" | "warning" | "error";
export type CaptureStatus = { text: string; tone: CaptureStatusTone };

const DEFAULT_STATUS: CaptureStatus = {
  text: "Click capture, then place the call. The transcript saves to Call logs.",
  tone: "idle",
};

type CallCaptureContextValue = {
  call: Call;
  logs: CallLog[];
  capturing: boolean;
  status: CaptureStatus;
  flashing: Record<string, boolean>;
  startCapture: () => void;
  stopCapture: () => void;
  deleteLog: (id: string) => void;
  clearAll: () => void;
};

const CallCaptureContext = createContext<CallCaptureContextValue | null>(null);

export function CallCaptureProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { rememberClient } = useMemory();
  const toast = useToast();
  const email = (user?.email || "").toLowerCase();
  const CALL_KEY = scopedKey("bsl_last_call", email);
  const LOGS_KEY = scopedKey("bsl_call_logs", email);

  const [call, setCall] = useState<Call>(() => {
    const stored = getJSON<Call>(CALL_KEY);
    if (stored && Array.isArray(stored.lines)) return stored;
    return { lines: [], duration: 0, when: null, summary: {} };
  });
  const [logs, setLogs] = useState<CallLog[]>(() => {
    const stored = getJSON<CallLog[]>(LOGS_KEY);
    return Array.isArray(stored) ? stored : [];
  });
  const [capturing, setCapturing] = useState(false);
  const [status, setStatusState] = useState<CaptureStatus>(DEFAULT_STATUS);
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});

  // Refs mirror the plain closure variables the original vanilla script
  // used — the Web Speech API is imperative and non-rendering, so these
  // stay authoritative between async recognition events instead of
  // relying on (possibly stale) React state.
  const callRef = useRef(call);
  const logsRef = useRef(logs);
  const capturingRef = useRef(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const startedAtRef = useRef(0);
  const gotAudioRef = useRef(false);
  const netErrorsRef = useRef(0);
  const restartDelayRef = useRef(0);
  const announcedExtractRef = useRef(false);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noSpeechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migratedRef = useRef(false);

  const setStatus = useCallback((text: string, tone: CaptureStatusTone) => {
    setStatusState({ text, tone });
  }, []);

  const updateCall = useCallback(
    (next: Call) => {
      callRef.current = next;
      setCall(next);
      setJSON(CALL_KEY, next);
      return next;
    },
    [CALL_KEY]
  );

  const updateLogs = useCallback(
    (next: CallLog[]) => {
      logsRef.current = next;
      setLogs(next);
      setJSON(LOGS_KEY, next);
      return next;
    },
    [LOGS_KEY]
  );

  // Migrate a pre-logs captured call into the log list (mirrors the
  // original's one-time restore-on-load check).
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    if (callRef.current.lines.length && !logsRef.current.length) {
      updateLogs([makeLog(callRef.current)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the connection comes back mid-capture, retry immediately.
  useEffect(() => {
    function handleOnline() {
      if (capturingRef.current && recRef.current) {
        try {
          recRef.current.start();
        } catch {
          /* already running */
        }
      }
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // Stop everything on unmount so a route change can't leak a live mic.
  useEffect(() => {
    return () => {
      capturingRef.current = false;
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      if (noSpeechTimeoutRef.current) clearTimeout(noSpeechTimeoutRef.current);
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const flashField = useCallback((key: string) => {
    setFlashing((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setFlashing((prev) => ({ ...prev, [key]: false }));
    }, 1400);
  }, []);

  /* Only fills fields that are still empty ("never overwrite"). */
  const extractDetails = useCallback(
    (text: string, base?: Call): boolean => {
      if (!text || !text.trim()) return false;
      const current = base ?? callRef.current;
      const summary: CallSummary = { ...current.summary };
      let found = false;
      EXTRACTORS.forEach((ex) => {
        if ((summary[ex.key] || "").trim()) return; // never overwrite
        for (let i = 0; i < ex.res.length; i++) {
          const m = text.match(ex.res[i]);
          if (!m || !m[1]) continue;
          const v = cleanValue(m[1]);
          if (v.length < 3) continue;
          if (ex.reject && ex.reject.test(v)) continue;
          summary[ex.key] = v;
          flashField(ex.key);
          found = true;
          break;
        }
      });
      if (found) {
        updateCall({ ...current, summary });
        if (!announcedExtractRef.current) {
          announcedExtractRef.current = true;
          toast("Details captured from the call. Check the summary panel", true);
        }
      }
      return found;
    },
    [flashField, updateCall, toast]
  );

  function elapsed() {
    return (Date.now() - startedAtRef.current) / 1000;
  }

  const fatal = useCallback(
    (msg: string) => {
      capturingRef.current = false;
      setCapturing(false);
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      if (noSpeechTimeoutRef.current) {
        clearTimeout(noSpeechTimeoutRef.current);
        noSpeechTimeoutRef.current = null;
      }
      // keep whatever was transcribed before the failure as a log
      const current = callRef.current;
      if (current.lines.length) {
        const withDuration = updateCall({ ...current, duration: elapsed() });
        updateLogs([makeLog(withDuration), ...logsRef.current]);
      }
      setStatus(msg, "error");
      logActivity("call", "Call capture stopped by an error" + (current.lines.length ? " · partial transcript kept" : ""));
      toast(msg);
    },
    [updateCall, updateLogs, setStatus, logActivity, toast]
  );

  const startCapture = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast("Speech recognition isn't supported in this browser. Try Edge or Chrome");
      return;
    }

    // starting a fresh capture replaces the previous call and its summary
    updateCall({ lines: [], duration: 0, when: new Date().toISOString(), summary: {} });
    announcedExtractRef.current = false;
    setFlashing({});
    capturingRef.current = true;
    setCapturing(true);
    startedAtRef.current = Date.now();
    gotAudioRef.current = false;
    netErrorsRef.current = 0;
    restartDelayRef.current = 0;

    const rec = new SR();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true; // kept live like the original, but interim text is dropped — no live-transcript panel exists in this UI
    rec.lang = "en-US";

    rec.onresult = (e) => {
      gotAudioRef.current = true;
      netErrorsRef.current = 0;
      restartDelayRef.current = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (!result.isFinal) continue; // interim results dropped: no live view to show them in
        const line: CallLine = { t: elapsed(), text };
        const next = updateCall({ ...callRef.current, lines: [...callRef.current.lines, line] });
        extractDetails(text, next);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        fatal("Microphone blocked for this site. Click the padlock in the address bar and allow the microphone, then try again.");
      } else if (e.error === "audio-capture") {
        fatal("No microphone found. Plug one in or check your input device.");
      } else if (e.error === "network") {
        // The browser streams audio to a cloud speech service; a single
        // "network" error is often transient. Retry with backoff and only
        // give up after several failures in a row.
        netErrorsRef.current++;
        if (netErrorsRef.current >= 4) {
          if (navigator.brave) {
            fatal("Speech recognition doesn't work in Brave (it blocks the speech service). Please use Chrome or Edge for transcript capture.");
          } else if (navigator.onLine === false) {
            fatal("You're offline. Reconnect to the internet and start capture again.");
          } else {
            fatal("Can't reach the browser's speech service. It may be blocked by a firewall, VPN, or ad-blocker. Check your connection (or try Chrome/Edge) and start capture again.");
          }
          return;
        }
        restartDelayRef.current = 1000 * netErrorsRef.current;
        setStatus("Speech service hiccup. Reconnecting (attempt " + netErrorsRef.current + " of 3)…", "warning");
      } else if (e.error === "language-not-supported") {
        fatal("Speech recognition doesn't support this language setting.");
      }
      // "no-speech" and "aborted" are normal. The restart loop handles them.
    };

    // Chrome/Edge stop recognition after silence; restart while capturing.
    // After a network error, wait a moment before retrying so we don't
    // hammer an unreachable service.
    rec.onend = () => {
      if (!capturingRef.current) return;
      const restart = () => {
        if (!capturingRef.current) return;
        try {
          recRef.current?.start();
        } catch {
          /* already restarting */
        }
      };
      if (restartDelayRef.current) {
        const delay = restartDelayRef.current;
        restartDelayRef.current = 0;
        setTimeout(restart, delay);
      } else {
        restart();
      }
    };

    // If nothing is heard in the first 12s, explain the usual causes
    if (noSpeechTimeoutRef.current) clearTimeout(noSpeechTimeoutRef.current);
    noSpeechTimeoutRef.current = setTimeout(() => {
      if (capturingRef.current && !gotAudioRef.current) {
        setStatus(
          "Recording, but no speech detected yet. Make sure this site has mic access, speak normally, and play the call through speakers (not headphones) so the AI's voice is heard too.",
          "warning"
        );
      }
    }, 12000);

    try {
      rec.start();
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = setInterval(() => {
        setStatus("Recording your call. " + fmtTime(elapsed()) + ". Click Stop when the call ends.", "recording");
      }, 500);
    } catch {
      fatal("Couldn't start speech recognition in this browser.");
    }
  }, [toast, updateCall, extractDetails, fatal, setStatus]);

  const stopCapture = useCallback(() => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    setCapturing(false);
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (noSpeechTimeoutRef.current) {
      clearTimeout(noSpeechTimeoutRef.current);
      noSpeechTimeoutRef.current = null;
    }

    const sweptCall: Call = { ...callRef.current, duration: elapsed(), when: new Date().toISOString() };
    const found = extractDetails(sweptCall.lines.map((l) => l.text).join(". "), sweptCall);
    const finalCall = found ? callRef.current : updateCall(sweptCall);

    if ((finalCall.summary.business || "").trim()) rememberClient(finalCall.summary);

    updateLogs([makeLog(finalCall), ...logsRef.current].slice(0, 20));

    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }

    setStatus(
      finalCall.lines.length
        ? "Captured " + fmtTime(finalCall.duration) + ". Transcript saved to Call logs; summary on the left."
        : "Click capture, then place the call. The transcript saves to Call logs.",
      "idle"
    );
    logActivity(
      "call",
      "Logged a call · " + fmtTime(finalCall.duration) + ", " + finalCall.lines.length + " line" + (finalCall.lines.length !== 1 ? "s" : "")
    );
    toast("Call logged. Review the summary on the left", true);
  }, [extractDetails, updateCall, updateLogs, rememberClient, logActivity, toast, setStatus]);

  const deleteLog = useCallback(
    (id: string) => {
      updateLogs(logsRef.current.filter((l) => l.id !== id));
      toast("Call log deleted", true);
    },
    [updateLogs, toast]
  );

  const clearAll = useCallback(() => {
    updateLogs([]);
    updateCall({ lines: [], duration: 0, when: null, summary: {} });
    logActivity("call", "Cleared all call logs");
    toast("Call logs cleared", true);
  }, [updateLogs, updateCall, logActivity, toast]);

  const value = useMemo(
    () => ({ call, logs, capturing, status, flashing, startCapture, stopCapture, deleteLog, clearAll }),
    [call, logs, capturing, status, flashing, startCapture, stopCapture, deleteLog, clearAll]
  );

  return <CallCaptureContext.Provider value={value}>{children}</CallCaptureContext.Provider>;
}

export function useCallCapture() {
  const ctx = useContext(CallCaptureContext);
  if (!ctx) throw new Error("useCallCapture must be used within CallCaptureProvider");
  return ctx;
}

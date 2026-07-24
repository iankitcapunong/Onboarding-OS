"use client";

import { CAPS, ONB_LABELS, fmtTime, useCallCapture } from "@/hooks/useCallCapture";
import { AgentWidget } from "@/components/site/AgentWidget";

/* Voice agent (AgentWidget) plus the manual transcript-capture UI,
   side by side — restored after e44b437 dropped the capture UI when
   reducing this page to just the voice agent. /app/calls, /app/dashboard
   (via lib/dashboardStats.ts), and /app/onboarding all read the call logs
   startCapture/stopCapture produce, so keeping this wired up here is what
   keeps those pages populated. */
export default function AgentPage() {
  const { call, capturing, status, flashing, startCapture, stopCapture } = useCallCapture();

  const filled = CAPS.filter((k) => (call.summary[k] || "").trim()).length;
  const pct = Math.round((filled / CAPS.length) * 100);

  function handleCaptureClick() {
    if (capturing) {
      stopCapture();
    } else {
      startCapture();
    }
  }

  return (
    <>
      <div className="voice-panel">
        <span className="voice-eyebrow">Voice onboarding</span>
        <h3>Talk to your AI onboarding specialist here</h3>
        <p className="voice-sub">Start a conversation with the agent below, and capture the transcript so it saves to Call logs.</p>
        <div className="voice-box">
          <div className="voice-widget-slot">
            <AgentWidget />
          </div>
          <div className="capture-bar">
            <button type="button" className={`btn btn-secondary btn-sm${capturing ? " recording" : ""}`} id="captureBtn" onClick={handleCaptureClick}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
              <span className="btn-label">{capturing ? "Stop capture" : "Start transcript capture"}</span>
            </button>
            <span className="capture-status" id="captureStatus">
              {(status.tone === "recording" || status.tone === "warning") && <span className="rec-dot" />}{" "}
              {status.tone === "error" ? <span style={{ color: "#fca5a5" }}>{status.text}</span> : status.text}
            </span>
          </div>
        </div>
        <p className="voice-note">Please allow microphone access when prompted so the agent can hear you.</p>
      </div>

      <div className="summary-solo">
        <aside className="panel chat-side">
          <h3>Call summary</h3>
          <p className="panel-sub" id="summaryMeta">
            {call.lines.length ? `Captured from your call · ${fmtTime(call.duration)}.` : "No call captured yet. Details from your call will appear here."}
          </p>
          <dl className="capture-list">
            {CAPS.map((key) => {
              const val = (call.summary[key] || "").trim();
              return (
                <div className={`capture-item${val ? " captured" : ""}`} key={key}>
                  <dt>{ONB_LABELS[key]}</dt>
                  <dd data-cap={key} data-ph="Auto-fills from call…" className={flashing[key] ? "flash" : undefined}>
                    {val}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className="capture-progress">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="panel-sub" style={{ margin: 0 }}>
                Completion
              </span>
              <strong id="captPct">{pct}%</strong>
            </div>
            <div className="meter">
              <div className="meter-fill" id="captMeter" style={{ width: pct + "%" }} />
            </div>
          </div>
          <p className="summary-hint">
            Fields fill in automatically from your call. Use <strong>Clear call</strong> to start over.
          </p>
          <div className="say-hints" id="sayHints" hidden={filled === CAPS.length}>
            <p className="say-hints-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
              Fields fill in automatically when you say things like:
            </p>
            <ul>
              <li data-hint="business" className={(call.summary.business || "").trim() ? "done" : undefined}>
                &quot;My business is called <em>Rivera Real Estate</em>&quot;
              </li>
              <li data-hint="offer" className={(call.summary.offer || "").trim() ? "done" : undefined}>
                &quot;We offer <em>full-service home buying</em>&quot;
              </li>
              <li data-hint="audience" className={(call.summary.audience || "").trim() ? "done" : undefined}>
                &quot;Our clients are <em>first-time home buyers</em>&quot;
              </li>
              <li data-hint="goal" className={(call.summary.goal || "").trim() ? "done" : undefined}>
                &quot;My goal is to <em>get more listing leads</em>&quot;
              </li>
              <li data-hint="voice" className={(call.summary.voice || "").trim() ? "done" : undefined}>
                &quot;Our tone should be <em>professional but friendly</em>&quot;
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}

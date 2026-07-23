"use client";

import { useState } from "react";
import Link from "next/link";
import { SheetLogPanel } from "@/components/app/SheetLogPanel";
import { CAPS, ONB_LABELS, fmtTime, fmtWhen, useCallCapture, type CallLog } from "@/hooks/useCallCapture";

function OnbLogItem({ log }: { log: CallLog }) {
  const [open, setOpen] = useState(false);
  const summary = log.summary || {};
  const business = (summary.business || log.business || "").trim();
  const filled = CAPS.filter((k) => (summary[k] || "").trim());
  const pct = Math.round((filled.length / CAPS.length) * 100);
  const statusLabel = pct === 100 ? "Complete" : pct > 0 ? "Partial" : "No details";
  const statusClass = pct === 100 ? "ok" : pct > 0 ? "warn" : "none";

  return (
    <div className="call-log onb-log">
      <div className="call-log-head">
        <span className="call-log-ic">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="m9 15 2 2 4-4" />
          </svg>
        </span>
        <div className="call-log-main">
          <strong>
            {business || "Unknown client"} · {fmtWhen(log.when)}
          </strong>
          <span>
            {fmtTime(log.duration)} call · {filled.length} of {CAPS.length} details captured
          </span>
        </div>
        <span className={`onb-badge ${statusClass}`}>{statusLabel}</span>
        <button type="button" className="call-log-view" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Details"}
        </button>
      </div>
      <div className="call-log-body onb-body" hidden={!open}>
        {open && (
          <dl className="onb-detail">
            {CAPS.map((k) => {
              const v = (summary[k] || "").trim();
              return (
                <div className={`onb-detail-row${v ? " filled" : ""}`} key={k}>
                  <dt>{ONB_LABELS[k]}</dt>
                  <dd>{v || "Not captured"}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </div>
  );
}

export default function OnboardingLogsPage() {
  const { logs } = useCallCapture();

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Onboarding logs</h2>
          <p className="page-sub">Every onboarding session and what the system captured from it. Business, offer, audience, goal and brand voice.</p>
        </div>
        <Link href="/app/calls" className="btn btn-secondary btn-sm">View transcripts</Link>
      </div>

      <SheetLogPanel
        sheet="onboarding-log"
        title="Sheet onboarding log"
        unit="session"
        emptyMsg={
          <>
            No sessions in the sheet yet.
            <br />
            Rows added to <strong>Onboarding Log</strong> show up here.
          </>
        }
      />

      <div className="panel">
        {logs.length === 0 ? (
          <div className="transcript-empty">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="m9 15 2 2 4-4" />
            </svg>
            <p>
              No onboarding sessions yet.
              <br />
              Capture a call from the <strong>Onboarding agent</strong> page and the details land here.
            </p>
          </div>
        ) : (
          logs.map((lg) => <OnbLogItem key={lg.id} log={lg} />)
        )}
      </div>
    </>
  );
}

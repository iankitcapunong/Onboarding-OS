"use client";

import { useState } from "react";
import { SheetLogPanel } from "@/components/app/SheetLogPanel";
import { useCallCapture, fmtTime, fmtWhen, type CallLog } from "@/hooks/useCallCapture";
import { useToast } from "@/components/app/ToastProvider";

function CallLogItem({ log, onDelete }: { log: CallLog; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  function handleDelete() {
    if (!confirm("Delete this call log?")) return;
    onDelete(log.id);
  }

  return (
    <div className="call-log">
      <div className="call-log-head">
        <span className="call-log-ic">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </span>
        <div className="call-log-main">
          <strong>Call · {fmtWhen(log.when)}</strong>
          <span>
            {fmtTime(log.duration)} · {log.lines.length} line{log.lines.length !== 1 ? "s" : ""}
            {log.business ? ` · ${log.business}` : ""}
          </span>
        </div>
        <button type="button" className="call-log-view" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Transcript"}
        </button>
        <button type="button" className="call-log-del" aria-label="Delete this call log" onClick={handleDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>
      <div className="call-log-body" hidden={!open}>
        {open &&
          (log.lines.length ? (
            log.lines.map((line, i) => (
              <div className="msg msg-agent transcript-line" key={i}>
                <span className="msg-meta">Call audio · {fmtTime(line.t)}</span>
                <span className="msg-body">{line.text}</span>
              </div>
            ))
          ) : (
            <p className="call-log-none">No speech was transcribed on this call.</p>
          ))}
      </div>
    </div>
  );
}

export default function CallsPage() {
  const { logs, call, deleteLog, clearAll } = useCallCapture();
  const toast = useToast();

  function handleClearCall() {
    if (!logs.length && !call.lines.length) {
      toast("No call logs to clear");
      return;
    }
    if (!confirm("Clear all call logs and the captured summary?")) return;
    clearAll();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Call logs</h2>
          <p className="page-sub">Every onboarding call the system captured. Transcript, duration and extracted details.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" id="clearCall" onClick={handleClearCall}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          Clear logs
        </button>
      </div>

      <SheetLogPanel
        sheet="call-log"
        title="Sheet call log"
        unit="call"
        emptyMsg={
          <>
            No calls in the sheet yet.
            <br />
            Rows added to <strong>Call Log</strong> show up here.
          </>
        }
      />

      <div className="panel">
        {logs.length === 0 ? (
          <div className="transcript-empty">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <p>
              No calls logged yet.
              <br />
              Capture one from the <strong>Onboarding agent</strong> page and it shows up here.
            </p>
          </div>
        ) : (
          logs.map((lg) => <CallLogItem key={lg.id} log={lg} onDelete={deleteLog} />)
        )}
      </div>
    </>
  );
}

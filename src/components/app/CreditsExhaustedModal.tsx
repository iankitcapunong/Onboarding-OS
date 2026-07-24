"use client";

import { useEffect, useRef, useState } from "react";
import { useCredits } from "@/hooks/useCredits";

export function CreditsExhaustedModal() {
  const { creditsExhausted } = useCredits();
  const [dismissed, setDismissed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Reset `dismissed` whenever credits go from exhausted back to available,
  // so a later month hitting 0 again re-shows the popup. Adjusting state
  // during render (rather than in an effect) avoids an extra render pass.
  const [prevExhausted, setPrevExhausted] = useState(creditsExhausted);
  if (creditsExhausted !== prevExhausted) {
    setPrevExhausted(creditsExhausted);
    if (!creditsExhausted && dismissed) setDismissed(false);
  }

  const open = creditsExhausted && !dismissed;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setDismissed(true);
    }
    document.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) setDismissed(true);
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="creditsExhaustedTitle">
        <div className="modal-head">
          <div className="modal-id">
            <h3 id="creditsExhaustedTitle">You&apos;re out of credits for this month</h3>
          </div>
          <button type="button" className="modal-close" aria-label="Close" ref={closeRef} onClick={() => setDismissed(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="panel-sub">
            You&apos;ve used all of your credits for this billing period. AI features are locked until they reset next month.
          </p>
        </div>
        <div className="modal-foot">
          <a className="btn btn-primary" href="mailto:bryansumait.automate@gmail.com">
            Upgrade / contact us
          </a>
        </div>
      </div>
    </div>
  );
}

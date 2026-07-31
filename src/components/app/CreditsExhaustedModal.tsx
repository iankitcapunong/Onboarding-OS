"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCredits } from "@/hooks/useCredits";
import { PLAN_CREDITS } from "@/lib/featureGating";

/* Covers both locks of the single-plan model: the 7-day trial clock
   running out, and the credit pot (trial's one-time 3000, or pro's
   monthly allowance) hitting zero. Open state lives in CreditsProvider:
   it auto-opens when a lock engages and re-opens on every blocked AI
   attempt (spendCredits), so dismissing it never hides the paywall for
   good. Dismissible — enforcement lives in spendCredits() and
   server-side in every Edge Function, this is just the explanation —
   and suppressed on the billing page, which is where its own CTA sends
   people. */
export function CreditsExhaustedModal() {
  const { upgradeModalOpen, closeUpgradeModal, trialExpired, planKey } = useCredits();
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = upgradeModalOpen && pathname !== "/app/billing";

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") closeUpgradeModal();
    }
    document.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, closeUpgradeModal]);

  if (!open) return null;

  const title = trialExpired
    ? "Your free trial has ended"
    : planKey === "pro"
      ? "You're out of credits for this month"
      : "You've used your trial credits";

  const body = trialExpired
    ? "Your 7-day free trial is over. Upgrade to Pro to keep using AI features — everything you built is still here waiting."
    : planKey === "pro"
      ? "You've used this month's credits — they reset automatically next month."
      : `You've used the ${PLAN_CREDITS.trial.toLocaleString()} credits included with your trial. Upgrade to Pro to keep going.`;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeUpgradeModal();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="creditsExhaustedTitle">
        <div className="modal-head">
          <div className="modal-id">
            <h3 id="creditsExhaustedTitle">{title}</h3>
          </div>
          <button type="button" className="modal-close" aria-label="Close" ref={closeRef} onClick={closeUpgradeModal}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="panel-sub">{body}</p>
        </div>
        <div className="modal-foot">
          <Link className="btn btn-primary" href="/app/billing" onClick={closeUpgradeModal}>
            {planKey === "pro" ? "Go to Billing" : "Upgrade to Pro"}
          </Link>
        </div>
      </div>
    </div>
  );
}

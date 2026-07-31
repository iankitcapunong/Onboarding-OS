"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callStripeCheckout } from "@/lib/edgeFunctions";
import { PLAN_CREDITS } from "@/lib/featureGating";

const PRO_FEATURES = [
  "Everything unlocked — agent, assistants, tools, integrations",
  "Website builder, creative ads, image & video studios",
  `${PLAN_CREDITS.pro.toLocaleString()} credits every month`,
  "Credit top-ups whenever you need more",
  "Cancel anytime from the billing portal",
];

const TOPUPS: { pack: "small" | "large"; credits: number; label: string }[] = [
  { pack: "small", credits: 250, label: "Small top-up" },
  { pack: "large", credits: 1000, label: "Large top-up" },
];

// useSearchParams() needs a Suspense boundary for static prerendering.
export default function BillingPage() {
  return (
    <Suspense fallback={<div className="panel"><p className="panel-sub">Loading…</p></div>}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const { isAdmin } = useFeatureGating();
  const { planKey, trialDaysLeft, trialExpired, creditsLeft, creditAllowance } = useCredits();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const [busy, setBusy] = useState<string | null>(null);

  const status = searchParams.get("status");
  const isPro = planKey === "pro";

  async function go(payload: Parameters<typeof callStripeCheckout>[1], key: string) {
    setBusy(key);
    try {
      const { url } = await callStripeCheckout(supabase, payload);
      window.location.href = url;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't open Stripe right now");
      setBusy(null);
    }
  }

  const trialStatus = trialExpired
    ? "Free trial · ended — upgrade to Pro to keep using AI features"
    : `Free trial · ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left · ${creditsLeft} of ${creditAllowance} credits remaining`;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Billing</h2>
          <p className="page-sub">
            Every account starts with a 7-day free trial and {PLAN_CREDITS.trial.toLocaleString()} credits.
            Payments run through Stripe&rsquo;s secure checkout — we never see your card.
          </p>
        </div>
      </div>

      {status === "success" && (
        <div className="panel" style={{ marginBottom: 14, borderColor: "var(--primary)" }}>
          <h3>Payment confirmed</h3>
          <p className="panel-sub">
            Stripe has confirmed your payment — your account updates here the moment the webhook lands,
            usually within a few seconds.
          </p>
        </div>
      )}
      {status === "cancelled" && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <p className="panel-sub">Checkout cancelled — nothing was charged.</p>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 14, ...(trialExpired && !isAdmin ? { borderColor: "var(--primary)" } : {}) }}>
        <h3>Current plan</h3>
        <p className="panel-sub" style={{ marginTop: 4 }}>
          {isAdmin
            ? "Admin — unlimited, nothing to manage here."
            : isPro
              ? `Pro · ${creditsLeft} of ${creditAllowance} credits left this month`
              : trialStatus}
        </p>
        {!isAdmin && isPro && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => go({ action: "portal" }, "portal")}
            disabled={busy !== null}
          >
            {busy === "portal" ? "Opening…" : "Manage billing / cancel"}
          </button>
        )}
      </div>

      {!isAdmin && !isPro && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3>Upgrade to Pro</h3>
          <p className="panel-sub">
            {trialExpired
              ? "Your trial has ended — Pro picks up right where it left off."
              : "Keep everything after your trial ends. Price shown at Stripe checkout."}
          </p>
          <ul className="panel-sub" style={{ margin: "12px 0 0 18px", display: "grid", gap: 6 }}>
            {PRO_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => go({ action: "subscribe" }, "subscribe")}
            disabled={busy !== null}
          >
            {busy === "subscribe" ? "Opening…" : "Upgrade to Pro"}
          </button>
        </div>
      )}

      {!isAdmin && isPro && (
        <div className="panel">
          <h3>Credit top-ups</h3>
          <p className="panel-sub">
            Pay-as-you-go: one-time packs added to this month&rsquo;s balance the moment Stripe confirms
            payment.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            {TOPUPS.map((t) => (
              <button
                key={t.pack}
                type="button"
                className="btn btn-secondary"
                onClick={() => go({ action: "topup", pack: t.pack }, `topup-${t.pack}`)}
                disabled={busy !== null}
              >
                {busy === `topup-${t.pack}` ? "Opening…" : `${t.label} · +${t.credits} credits`}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Top-ups apply to the current month&rsquo;s balance and don&rsquo;t roll over.
          </p>
        </div>
      )}
    </>
  );
}

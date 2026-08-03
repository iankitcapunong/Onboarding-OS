"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callStripeCheckout, type StripeConfirmResult, type StripeSyncResult } from "@/lib/edgeFunctions";
import { PLAN_CREDITS } from "@/lib/featureGating";

const PRO_FEATURES = [
  "Everything unlocked — agent, assistants, tools, integrations",
  "Website builder, creative ads, image & video studios",
  `${PLAN_CREDITS.pro.toLocaleString()} credits every month`,
  "Cancel anytime from the billing portal",
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
  const sessionId = searchParams.get("session_id");
  const isPro = planKey === "pro";

  /* Webhook-free confirmation. Stripe's success redirect carries
     ?session_id=cs_…; hand it to the Edge Function, which verifies the
     payment with Stripe before touching the plan. No URL scrubbing
     needed: the server claims each session id once, so a refresh gets
     { duplicate: true } and nothing double-grants. The plan flip itself
     arrives through the profiles realtime stream (useFeatureGating). */
  const [confirmState, setConfirmState] = useState<"idle" | "confirming" | "confirmed" | "failed">(
    status === "success" && sessionId ? "confirming" : "idle"
  );
  const [confirmedKind, setConfirmedKind] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "success" || !sessionId) return;
    let cancelled = false;
    callStripeCheckout<StripeConfirmResult>(supabase, { action: "confirm", session_id: sessionId })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setConfirmState("confirmed");
          setConfirmedKind(res.kind ?? null);
          if (res.kind === "topup") toast("Credits added to your account.");
        } else {
          setConfirmState("failed");
        }
      })
      .catch(() => {
        if (!cancelled) setConfirmState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [status, sessionId, supabase, toast]);

  /* Reconcile with Stripe on plain visits: catches portal
     cancellations and lapsed renewals. Result lands via the profiles
     realtime stream, so nothing to do with the response here. */
  useEffect(() => {
    if (status === "success") return;
    callStripeCheckout<StripeSyncResult>(supabase, { action: "sync" }).catch(() => {});
  }, [status, supabase]);

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

      {confirmState === "confirming" && (
        <div className="panel" style={{ marginBottom: 14, borderColor: "var(--primary)" }}>
          <h3>Confirming your payment…</h3>
          <p className="panel-sub">Checking with Stripe — this takes a second or two.</p>
        </div>
      )}
      {confirmState === "confirmed" && (
        <div className="panel" style={{ marginBottom: 14, borderColor: "var(--primary)" }}>
          <h3>Payment confirmed</h3>
          <p className="panel-sub">
            {confirmedKind === "topup"
              ? "Your credits have been added and are ready to use."
              : "Welcome to Pro — everything is unlocked."}
          </p>
        </div>
      )}
      {confirmState === "failed" && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3>Payment not confirmed yet</h3>
          <p className="panel-sub">
            Stripe hasn&rsquo;t marked this payment as complete. If you finished checkout, reload this
            page in a moment — and if you were charged but nothing changes, contact support.
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

    </>
  );
}

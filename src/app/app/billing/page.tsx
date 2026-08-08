"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callStripeCheckout, type StripeConfirmResult, type StripeSyncResult } from "@/lib/edgeFunctions";
import { CREDIT_COSTS, PLAN_CREDITS } from "@/lib/featureGating";
import { MODELS, modelCreditCost } from "@/components/videos/models";

// Friendly names for the CREDIT_COSTS kinds, in display order.
const CREDIT_COST_LABELS: Record<string, string> = {
  asset: "Assets",
  creative: "Creative ads",
  images: "Image studio",
  videos: "Video studio",
};

/* Video is the one kind whose price varies by model, so the flat
   CREDIT_COSTS.videos line above would understate a Veo 3.1 render.
   Derived from the catalogue rather than restated, so adding a premium
   model surfaces here without another edit. */
const PREMIUM_VIDEO_MODELS = MODELS.filter((m) => modelCreditCost(m) !== CREDIT_COSTS.videos).map(
  (m) => `${m.name} at ${modelCreditCost(m)}`
);

const PRO_FEATURES = [
  "Everything unlocked — agent, assistants, tools, integrations",
  "Creative ads, image & video studios",
  `${PLAN_CREDITS.pro.toLocaleString()} credits every month`,
  "Cancel anytime from the billing portal",
];

// "credits:2026-08" → "August 2026"; the trial's lifetime pot has no month.
function bucketLabel(bucket: string): string {
  if (bucket === "credits:trial") return "Free trial pot";
  const m = bucket.match(/^credits:(\d{4})-(\d{2})$/);
  if (!m) return bucket;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

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

  /* All-time credit ledger straight from usage_counters (RLS
     self-select, same read useCredits does): one row per bucket — the
     trial's lifetime pot plus one row per pro month. Drives the
     "Previous periods" list; the current bucket's live number comes
     from useCredits' realtime stream, not this one-shot read. */
  const [history, setHistory] = useState<{ bucket: string; count: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("usage_counters")
      .select("bucket, count")
      .like("bucket", "credits:%")
      .then(({ data }: { data: { bucket: string; count: number }[] | null }) => {
        if (cancelled) return;
        const rows = (data ?? []).slice().sort((a, b) => {
          if (a.bucket === "credits:trial") return 1;
          if (b.bucket === "credits:trial") return -1;
          return b.bucket.localeCompare(a.bucket);
        });
        setHistory(rows);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Mirrors useCredits' bucketFor() — kept in sync by hand.
  const currentBucket = isPro ? `credits:${new Date().toISOString().slice(0, 7)}` : "credits:trial";
  const creditsUsed = Math.max(0, creditAllowance - creditsLeft);
  const usedPct = creditAllowance > 0 ? Math.min(100, Math.round((creditsUsed / creditAllowance) * 100)) : 0;

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

      {!isAdmin && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3>Usage</h3>
          <p className="panel-sub" style={{ marginTop: 4 }}>
            {isPro
              ? `${creditsUsed.toLocaleString()} of ${creditAllowance.toLocaleString()} credits used this month — the allowance resets automatically each month.`
              : `${creditsUsed.toLocaleString()} of ${creditAllowance.toLocaleString()} trial credits used — the trial pot doesn't refill.`}
          </p>
          <div className="meter" style={{ marginTop: 10 }}>
            <div className="meter-fill" style={{ width: `${usedPct}%` }} />
          </div>
          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <strong style={{ fontSize: 13.5 }}>What actions cost</strong>
            <ul className="panel-sub" style={{ margin: "8px 0 0 18px", display: "grid", gap: 6 }}>
              {Object.entries(CREDIT_COST_LABELS).map(([kind, label]) => (
                <li key={kind}>
                  {label} — {CREDIT_COSTS[kind]} credits each
                  {kind === "videos" && PREMIUM_VIDEO_MODELS.length > 0 && (
                    <> (premium models cost more — {PREMIUM_VIDEO_MODELS.join(", ")})</>
                  )}
                </li>
              ))}
            </ul>
            <p className="hint" style={{ marginTop: 8 }}>
              Conversations on your published assistant links are metered against the period they happen
              in.
            </p>
          </div>
          {history !== null && history.some((r) => r.bucket !== currentBucket) && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <strong style={{ fontSize: 13.5 }}>Previous periods</strong>
              {history
                .filter((r) => r.bucket !== currentBucket)
                .map((r) => (
                  <p key={r.bucket} className="panel-sub" style={{ margin: "8px 0 0" }}>
                    {bucketLabel(r.bucket)} — {r.count.toLocaleString()} credits used
                  </p>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Top-up packs are deliberately absent: STRIPE_PRICE_TOPUP_SMALL/
          LARGE are unset on the server until the packs are priced, so a
          topup checkout would only error. stripe-checkout + the confirm
          flow above already handle kind "topup" — surfacing buttons here
          is all that's left once prices exist. */}

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

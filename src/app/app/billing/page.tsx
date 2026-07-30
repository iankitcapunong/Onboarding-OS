"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callStripeCheckout } from "@/lib/edgeFunctions";
import { PLANS, PLAN_CREDITS, planLabel, PlanKey } from "@/lib/featureGating";

const PLAN_BLURBS: Record<string, string> = {
  starter: "The core onboarding agent — build, publish, and review conversations.",
  growth: "Adds tools, integrations, and the creative suite for growing teams.",
  full: "Everything switched on, including image and video studios.",
};

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
  const { user } = useAuth();
  const { planKey, isAdmin } = useFeatureGating();
  const { creditsLeft, creditAllowance } = useCredits();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const [busy, setBusy] = useState<string | null>(null);
  const [livePlan, setLivePlan] = useState<PlanKey | null>(null);
  const polled = useRef(false);

  const status = searchParams.get("status");

  // Coming back from a successful Checkout: the webhook is the source
  // of truth and may land a beat after the redirect — poll the profile
  // briefly instead of showing a stale plan.
  useEffect(() => {
    if (status !== "success" || !user || polled.current) return;
    polled.current = true;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      const { data } = await supabase
        .from("profiles")
        .select("plan")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.plan) setLivePlan(data.plan as PlanKey);
      if (attempts >= 5) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [status, user, supabase]);

  const currentPlan = livePlan ?? planKey;

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

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Billing</h2>
          <p className="page-sub">
            Manage your subscription and credits. Payments run through Stripe&rsquo;s secure checkout —
            we never see your card.
          </p>
        </div>
      </div>

      {status === "success" && (
        <div className="panel" style={{ marginBottom: 14, borderColor: "var(--primary)" }}>
          <h3>Payment confirmed</h3>
          <p className="panel-sub">
            Stripe has confirmed your payment — your plan and credits update here within a few seconds.
          </p>
        </div>
      )}
      {status === "cancelled" && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <p className="panel-sub">Checkout cancelled — nothing was charged.</p>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 14 }}>
        <h3>Current plan</h3>
        <p className="panel-sub" style={{ marginTop: 4 }}>
          {isAdmin
            ? "Admin — unlimited, nothing to manage here."
            : `${planLabel(currentPlan)} · ${creditsLeft} of ${creditAllowance} credits left this month`}
        </p>
        {!isAdmin && (
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
        <>
          <div className="panel" style={{ marginBottom: 14 }}>
            <h3>Plans</h3>
            <p className="panel-sub">7-day free trial on every plan — cancel before it ends and you pay nothing. Prices shown at Stripe checkout.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, marginTop: 12 }}>
              {PLANS.map((p) => {
                const isCurrent = currentPlan === p.key;
                return (
                  <div
                    key={p.key}
                    style={{
                      border: `1px solid ${isCurrent ? "var(--primary)" : "var(--border)"}`,
                      borderRadius: 10,
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {p.label}
                      {isCurrent && <span className="side-badge">Current</span>}
                    </strong>
                    <p className="panel-sub" style={{ margin: 0, fontSize: 13.5 }}>{PLAN_BLURBS[p.key]}</p>
                    <p className="panel-sub" style={{ margin: 0, fontSize: 13.5 }}>
                      {PLAN_CREDITS[p.key]} credits / month
                    </p>
                    <button
                      type="button"
                      className={`btn ${isCurrent ? "btn-secondary" : "btn-primary"} btn-sm`}
                      style={{ marginTop: "auto" }}
                      onClick={() => go({ action: "subscribe", plan: p.key }, `plan-${p.key}`)}
                      disabled={busy !== null || isCurrent}
                    >
                      {busy === `plan-${p.key}` ? "Opening…" : isCurrent ? "Your plan" : "Choose plan"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

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
        </>
      )}
    </>
  );
}

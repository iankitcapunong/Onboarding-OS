"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useFeatureGating } from "./useFeatureGating";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { CREDIT_COSTS, PLAN_CREDITS, PlanKey } from "@/lib/featureGating";

type CreditsContextValue = {
  creditsLeft: number;
  creditAllowance: number;
  /** Out of credits (trial pot spent, or pro's monthly allowance used up). */
  creditsExhausted: boolean;
  /** The 7-day clock ran out on a trial account. */
  trialExpired: boolean;
  trialEndsAt: string | null;
  /** Whole days until the trial ends (0 when expired or on pro). */
  trialDaysLeft: number;
  planKey: PlanKey;
  /** Either lock — what AI feature pages/actions should gate on. */
  aiLocked: boolean;
  /** The upgrade/billing modal (CreditsExhaustedModal). Auto-opens when a
      lock engages, and re-opens on every blocked AI attempt after dismissal. */
  upgradeModalOpen: boolean;
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
  spendCredits: (kind: string, count?: number) => boolean;
  syncCreditsFromServer: (remaining: number) => void;
};

const CreditsContext = createContext<CreditsContextValue | null>(null);

// Mirrors _shared/limits.ts's creditsBucketFor(): the trial's 3000
// credits are one lifetime pot (no monthly reset — a trial spanning a
// month boundary doesn't get a fresh allowance); pro ledgers per month.
function bucketFor(plan: PlanKey) {
  return plan === "pro" ? `credits:${new Date().toISOString().slice(0, 7)}` : "credits:trial";
}

/* The server's usage_counters ledger is the single source of truth now
   — this reads the signed-in account's own row directly (RLS
   self-select from migration 0010) and STREAMS spends over realtime,
   so the balance shown is live across tabs and devices. The old
   localStorage mirror (sticky monthly locks, cross-tab merge) is gone
   with the plans it modeled; spendCredits() is only an optimistic
   pre-check for instant UX, reconciled by the realtime stream and by
   each Edge Function response echoing `remaining`. Admins are
   unmetered. */
export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isAdmin, planKey, trialEndsAt } = useFeatureGating();
  const toast = useToast();
  const [supabase] = useState(() => createClient());

  const userId = user?.id ?? null;
  const creditAllowance = PLAN_CREDITS[planKey];
  const bucket = bucketFor(planKey);

  const [used, setUsed] = useState(0);

  // Reset immediately on account switch (state adjusted during render,
  // same pattern as useFeatureGating) so a previous account's usage
  // never shows against the next account while its fetch is pending.
  const [trackedUserId, setTrackedUserId] = useState(userId);
  if (trackedUserId !== userId) {
    setTrackedUserId(userId);
    setUsed(0);
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    supabase
      .from("usage_counters")
      .select("count")
      .eq("user_id", userId)
      .eq("bucket", bucket)
      .maybeSingle()
      .then(({ data }: { data: { count: number } | null }) => {
        if (!cancelled) setUsed(data?.count ?? 0);
      });

    // Unique topic per mount — the singleton client shares one socket,
    // and same-name channels on it collide (see useFeatureGating).
    const channel = supabase
      .channel(`credits-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "usage_counters", filter: `user_id=eq.${userId}` },
        (payload: { new: { bucket?: string; count?: number } | null }) => {
          const row = payload.new;
          if (row && row.bucket === bucket && typeof row.count === "number") setUsed(row.count);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, bucket, supabase]);

  // Live trial countdown: re-evaluate the expiry comparison the moment
  // the deadline passes, so the lock engages in the open tab without a
  // reload (not just on the next fetch).
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (planKey === "pro" || !trialEndsAt) return;
    const msLeft = new Date(trialEndsAt).getTime() - Date.now();
    if (msLeft <= 0) return;
    const timer = window.setTimeout(() => setClock(Date.now()), msLeft + 1000);
    return () => window.clearTimeout(timer);
  }, [planKey, trialEndsAt]);

  const trialExpired =
    !isAdmin && planKey !== "pro" && trialEndsAt !== null && new Date(trialEndsAt).getTime() <= clock;
  const trialDaysLeft =
    planKey === "pro" || !trialEndsAt
      ? 0
      : Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - clock) / 86_400_000));

  const creditsExhausted = !isAdmin && used >= creditAllowance;
  const creditsLeft = isAdmin ? creditAllowance : Math.max(0, creditAllowance - used);
  const aiLocked = trialExpired || creditsExhausted;

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  // Auto-open the billing modal the moment a lock engages, and close it
  // when the lock lifts (upgrade landed, credits topped up) — same
  // adjust-during-render pattern as the account-switch reset above.
  const [prevLocked, setPrevLocked] = useState(aiLocked);
  if (aiLocked !== prevLocked) {
    setPrevLocked(aiLocked);
    setUpgradeModalOpen(aiLocked);
  }
  const openUpgradeModal = useCallback(() => setUpgradeModalOpen(true), []);
  const closeUpgradeModal = useCallback(() => setUpgradeModalOpen(false), []);

  const spendCredits = useCallback(
    (kind: string, count = 1) => {
      if (isAdmin) return true;
      if (trialExpired) {
        setUpgradeModalOpen(true);
        return false;
      }
      const cost = (CREDIT_COSTS[kind] || 0) * count;
      if (creditsLeft < cost) {
        // Fully out → the billing modal; partially short (some credits
        // left, just not enough for this action) → an explanatory toast,
        // since the modal's "you've used everything" copy would be wrong.
        if (creditsLeft === 0) {
          setUpgradeModalOpen(true);
        } else {
          toast(
            planKey === "pro"
              ? `Not enough credits — this needs ${cost} and you have ${creditsLeft}. Top up or wait for next month's reset.`
              : `Not enough trial credits — this needs ${cost} and you have ${creditsLeft}. Upgrade to Pro for more.`
          );
        }
        return false;
      }
      // Optimistic: the Edge Function's echoed `remaining` and the
      // realtime stream both reconcile this to the server's number.
      setUsed((prev) => prev + cost);
      return true;
    },
    [isAdmin, trialExpired, creditsLeft, planKey, toast]
  );

  const syncCreditsFromServer = useCallback(
    (remaining: number) => {
      if (isAdmin || typeof remaining !== "number") return;
      setUsed(Math.max(0, creditAllowance - remaining));
    },
    [isAdmin, creditAllowance]
  );

  const value = useMemo(
    () => ({
      creditsLeft,
      creditAllowance,
      creditsExhausted,
      trialExpired,
      trialEndsAt,
      trialDaysLeft,
      planKey,
      aiLocked,
      upgradeModalOpen,
      openUpgradeModal,
      closeUpgradeModal,
      spendCredits,
      syncCreditsFromServer,
    }),
    [creditsLeft, creditAllowance, creditsExhausted, trialExpired, trialEndsAt, trialDaysLeft, planKey, aiLocked, upgradeModalOpen, openUpgradeModal, closeUpgradeModal, spendCredits, syncCreditsFromServer]
  );

  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used within CreditsProvider");
  return ctx;
}

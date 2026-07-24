"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { useFeatureGating } from "./useFeatureGating";
import { useToast } from "@/components/app/ToastProvider";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";
import { CREDIT_COSTS, PLAN_CREDITS, PlanKey } from "@/lib/featureGating";

type CreditState = { month: string; used: number };

type CreditsContextValue = {
  creditsLeft: number;
  creditAllowance: number;
  creditsExhausted: boolean;
  spendCredits: (kind: string, count?: number) => boolean;
  syncCreditsFromServer: (remaining: number) => void;
};

const CreditsContext = createContext<CreditsContextValue | null>(null);

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

// Merges the freshest persisted usage with in-memory state, taking
// whichever recorded more spending this month. Reading localStorage
// fresh (rather than trusting a possibly-stale `creditState` closure)
// and taking the max, rather than just overwriting, is what stops
// concurrent writers — another tab, or two spends racing within this
// one — from reverting `used` backward and handing back credits that
// were already spent.
function reconcileUsed(stored: CreditState | null, prev: CreditState): CreditState {
  const prevUsed = prev.month === thisMonth() ? prev.used : 0;
  const storedUsed = stored && stored.month === thisMonth() ? stored.used : 0;
  return { month: thisMonth(), used: Math.max(prevUsed, storedUsed) };
}

/* Direct replacement for js/app.js's CREDITS section (spendCredits(),
   creditsLeft(), syncCreditsFromServer()/window.bslSyncCredits — the
   Edge Functions are the real source of truth; this reconciles the
   local optimistic counter to match what each AI-action response
   echoes back). Admins are unmetered. */
export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isAdmin, planKey } = useFeatureGating();
  const toast = useToast();
  const email = (user?.email || "").toLowerCase();
  const creditsKey = scopedKey("bsl_credits", email);

  const [creditState, setCreditState] = useState<CreditState>(() => ({ month: thisMonth(), used: 0 }));

  // `email` isn't known until useAuth's getUser() call resolves, so the
  // initial state above is a placeholder read under no particular
  // account. Re-hydrate from this account's real stored usage as soon as
  // the email is known (and again on account switch), instead of
  // silently sticking with the placeholder for the rest of the mount.
  const hydratedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!email || hydratedForRef.current === email) return;
    hydratedForRef.current = email;
    const stored = getJSON<CreditState>(creditsKey);
    setCreditState((prev) => reconcileUsed(stored, prev));
  }, [email, creditsKey]);

  const creditAllowance = PLAN_CREDITS[planKey as PlanKey] ?? PLAN_CREDITS.custom;
  const creditsLeft = Math.max(0, creditAllowance - creditState.used);
  const creditsExhausted = !isAdmin && creditsLeft <= 0;

  const spendCredits = useCallback(
    (kind: string, count = 1) => {
      if (isAdmin) return true;
      const cost = (CREDIT_COSTS[kind] || 0) * count;
      if (creditsLeft < cost) {
        toast(`Not enough credits — this needs ${cost} and you have ${creditsLeft}. Credits reset next month, or upgrade your plan.`);
        return false;
      }
      setCreditState((prev) => {
        const merged = reconcileUsed(getJSON<CreditState>(creditsKey), prev);
        const next = { ...merged, used: merged.used + cost };
        setJSON(creditsKey, next);
        return next;
      });
      return true;
    },
    [isAdmin, creditsLeft, creditsKey, toast]
  );

  // The Edge Function's response is authoritative (it already accounts
  // for every writer — every tab, every device), so unlike spendCredits
  // this intentionally overwrites rather than merging.
  const syncCreditsFromServer = useCallback(
    (remaining: number) => {
      if (isAdmin || typeof remaining !== "number") return;
      const next = { month: thisMonth(), used: Math.max(0, creditAllowance - remaining) };
      setCreditState(next);
      setJSON(creditsKey, next);
    },
    [isAdmin, creditAllowance, creditsKey]
  );

  const value = useMemo(
    () => ({ creditsLeft, creditAllowance, creditsExhausted, spendCredits, syncCreditsFromServer }),
    [creditsLeft, creditAllowance, creditsExhausted, spendCredits, syncCreditsFromServer]
  );

  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used within CreditsProvider");
  return ctx;
}

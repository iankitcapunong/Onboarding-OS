"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useFeatureGating } from "./useFeatureGating";
import { useToast } from "@/components/app/ToastProvider";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";
import { CREDIT_COSTS, PLAN_CREDITS, PlanKey } from "@/lib/featureGating";

type CreditState = { month: string; used: number };

type CreditsContextValue = {
  creditsLeft: number;
  creditAllowance: number;
  spendCredits: (kind: string, count?: number) => boolean;
  syncCreditsFromServer: (remaining: number) => void;
};

const CreditsContext = createContext<CreditsContextValue | null>(null);

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
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

  const [creditState, setCreditState] = useState<CreditState>(() => {
    const stored = getJSON<CreditState>(creditsKey);
    if (stored && stored.month === thisMonth()) return stored;
    return { month: thisMonth(), used: 0 };
  });

  const creditAllowance = PLAN_CREDITS[planKey as PlanKey] ?? PLAN_CREDITS.custom;
  const creditsLeft = Math.max(0, creditAllowance - creditState.used);

  const spendCredits = useCallback(
    (kind: string, count = 1) => {
      if (isAdmin) return true;
      const cost = (CREDIT_COSTS[kind] || 0) * count;
      if (creditsLeft < cost) {
        toast(`Not enough credits — this needs ${cost} and you have ${creditsLeft}. Credits reset next month, or upgrade your plan.`);
        return false;
      }
      const next = { ...creditState, used: creditState.used + cost };
      setCreditState(next);
      setJSON(creditsKey, next);
      return true;
    },
    [isAdmin, creditsLeft, creditState, creditsKey, toast]
  );

  const syncCreditsFromServer = useCallback(
    (remaining: number) => {
      if (isAdmin || typeof remaining !== "number") return;
      const next = { ...creditState, used: Math.max(0, creditAllowance - remaining) };
      setCreditState(next);
      setJSON(creditsKey, next);
    },
    [isAdmin, creditState, creditAllowance, creditsKey]
  );

  const value = useMemo(
    () => ({ creditsLeft, creditAllowance, spendCredits, syncCreditsFromServer }),
    [creditsLeft, creditAllowance, spendCredits, syncCreditsFromServer]
  );

  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used within CreditsProvider");
  return ctx;
}

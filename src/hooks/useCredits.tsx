"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { useFeatureGating } from "./useFeatureGating";
import { useToast } from "@/components/app/ToastProvider";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";
import { CREDIT_COSTS, PLAN_CREDITS, PlanKey } from "@/lib/featureGating";

// `exhaustedMonth` is a sticky lock: once a user hits 0 credits in a
// given month, it's stamped with that month and stays that way — even
// if a later signal (another tab's stale write, a corrected server
// balance) would otherwise put `used` back under the allowance — until
// the calendar month actually changes. "Used up" should mean used up
// for the rest of the month, not something that can flicker back.
type CreditState = { month: string; used: number; exhaustedMonth: string | null };

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

function freshState(): CreditState {
  return { month: thisMonth(), used: 0, exhaustedMonth: null };
}

// Drops usage and the exhausted lock from a snapshot recorded in an
// earlier month — a new month is a clean slate.
function normalize(state: CreditState | null): CreditState {
  if (!state || state.month !== thisMonth()) return freshState();
  return state;
}

// Merges two same-month snapshots by taking whichever recorded more
// spending — reading localStorage fresh and taking the max (rather
// than just overwriting) is what stops concurrent writers, e.g.
// another tab, from reverting `used` backward and handing back credits
// that were already spent. The exhausted lock is sticky across the
// merge too: if either snapshot already recorded exhaustion this
// month, the result stays exhausted.
function merge(a: CreditState, b: CreditState): CreditState {
  return {
    month: thisMonth(),
    used: Math.max(a.used, b.used),
    exhaustedMonth: a.exhaustedMonth === thisMonth() || b.exhaustedMonth === thisMonth() ? thisMonth() : null,
  };
}

// Stamps the sticky lock the first time usage reaches the allowance.
// Once stamped, callers should stop feeding this function a lower
// `used` and instead treat the state as locked outright (see
// syncCreditsFromServer below).
function withExhaustionCheck(state: CreditState, allowance: number): CreditState {
  if (state.exhaustedMonth === thisMonth() || state.used < allowance) return state;
  return { ...state, exhaustedMonth: thisMonth() };
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

  const [creditState, setCreditState] = useState<CreditState>(freshState);

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
    setCreditState((prev) => merge(normalize(prev), normalize(stored)));
  }, [email, creditsKey]);

  const creditAllowance = PLAN_CREDITS[planKey as PlanKey] ?? PLAN_CREDITS.custom;
  const creditsExhausted = !isAdmin && creditState.exhaustedMonth === thisMonth();
  const creditsLeft = creditsExhausted ? 0 : Math.max(0, creditAllowance - creditState.used);

  const spendCredits = useCallback(
    (kind: string, count = 1) => {
      if (isAdmin) return true;
      const cost = (CREDIT_COSTS[kind] || 0) * count;
      if (creditsLeft < cost) {
        toast(`Not enough credits — this needs ${cost} and you have ${creditsLeft}. Credits reset next month, or upgrade your plan.`);
        return false;
      }
      setCreditState((prev) => {
        const merged = merge(normalize(prev), normalize(getJSON<CreditState>(creditsKey)));
        const next = withExhaustionCheck({ ...merged, used: merged.used + cost }, creditAllowance);
        setJSON(creditsKey, next);
        return next;
      });
      return true;
    },
    [isAdmin, creditsLeft, creditsKey, creditAllowance, toast]
  );

  // The Edge Function's response is normally authoritative and would
  // overwrite outright — except once the sticky exhausted lock is set
  // for this month, in which case it's ignored: "used up" should hold
  // for the rest of the month even if a later signal (a stale sync, a
  // corrected server balance) would otherwise suggest credits again.
  const syncCreditsFromServer = useCallback(
    (remaining: number) => {
      if (isAdmin || typeof remaining !== "number") return;
      setCreditState((prev) => {
        const current = normalize(prev);
        if (current.exhaustedMonth === thisMonth()) {
          setJSON(creditsKey, current);
          return current;
        }
        const next = withExhaustionCheck(
          { month: thisMonth(), used: Math.max(0, creditAllowance - remaining), exhaustedMonth: null },
          creditAllowance
        );
        setJSON(creditsKey, next);
        return next;
      });
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

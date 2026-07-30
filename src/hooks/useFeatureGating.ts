"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_EMAILS, FEATURES, FeatureKey, LEGACY_FEATURE_ALIASES, PlanKey, planLabel } from "@/lib/featureGating";

type RemoteAccess = { plan: PlanKey; features: Partial<Record<FeatureKey, boolean>> | null };

/* Direct replacement for js/app.js's FEATURE GATING section (IS_ADMIN,
   featureOn(), myFeatures) — now reading each account's own real
   `profiles.plan`/`profiles.features` row from Supabase instead of
   localStorage, since an admin's local toggles never reached a real
   client's own device (see src/app/app/access/page.tsx). */
export function useFeatureGating() {
  const { user } = useAuth();
  const email = (user?.email || "").toLowerCase();
  const userId = user?.id ?? null;
  const [supabase] = useState(() => createClient());
  const [remote, setRemote] = useState<RemoteAccess | null>(null);

  // Reset immediately (adjusting state during render, not via an effect
  // — there's no external system to touch for this part) whenever the
  // signed-in account changes, so a stale previous account's flags never
  // leak into the next session while the new account's fetch is pending.
  const [trackedUserId, setTrackedUserId] = useState(userId);
  if (trackedUserId !== userId) {
    setTrackedUserId(userId);
    setRemote(null);
  }

  // `userId` isn't known until useAuth's getUser() call resolves — fetch
  // this account's real profiles row as soon as it's known, once per
  // account.
  const fetchedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || fetchedForRef.current === userId) return;
    fetchedForRef.current = userId;
    supabase
      .from("profiles")
      .select("plan, features")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setRemote({ plan: (data?.plan as PlanKey) ?? "starter", features: data?.features ?? null });
      });
  }, [userId, supabase]);

  return useMemo(() => {
    const isAdmin = ADMIN_EMAILS.includes(email);
    const planKey: PlanKey = remote?.plan ?? "starter";
    // null (including still-loading, before the fetch above resolves)
    // means no override — full access, matching the prior default.
    const overrides = remote?.features ?? null;

    const myFeatures = {} as Record<FeatureKey, boolean>;
    FEATURES.forEach((f) => {
      if (!overrides) {
        myFeatures[f.key] = true;
        return;
      }
      let flag = overrides[f.key];
      if (flag === undefined) {
        // Blob predates this feature key — inherit the first legacy
        // alias an admin explicitly set (e.g. assistants <- playground).
        for (const alias of LEGACY_FEATURE_ALIASES[f.key] ?? []) {
          if (overrides[alias] !== undefined) {
            flag = overrides[alias];
            break;
          }
        }
      }
      myFeatures[f.key] = flag !== false;
    });

    function featureOn(key: string) {
      if (isAdmin) return true;
      if (!(key in myFeatures)) return true; // non-gateable routes (dashboard, activity, settings)
      return myFeatures[key as FeatureKey];
    }

    // loaded = this account's real profiles row has been fetched. Route
    // guards must wait for it — before that, featureOn optimistically
    // answers true ("no override = full access") and a redirect decision
    // taken then would bounce users off pages they're allowed on.
    return { isAdmin, myFeatures, planKey, planLabel: planLabel(planKey), featureOn, loaded: remote !== null };
  }, [email, remote]);
}

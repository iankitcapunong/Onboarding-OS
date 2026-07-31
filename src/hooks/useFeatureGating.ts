"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_EMAILS, FEATURES, FeatureKey, LEGACY_FEATURE_ALIASES, PlanKey, normalizePlan, planLabel } from "@/lib/featureGating";

type RemoteAccess = {
  plan: PlanKey;
  features: Partial<Record<FeatureKey, boolean>> | null;
  trialEndsAt: string | null;
};

/* Direct replacement for js/app.js's FEATURE GATING section (IS_ADMIN,
   featureOn(), myFeatures) — reading each account's own real
   `profiles` row from Supabase, and now also STREAMING it: migration
   0010 put profiles in the realtime publication, so the moment
   stripe-webhook flips this account to 'pro' (or an admin toggles a
   feature) the change lands here live, no refresh or polling. */
export function useFeatureGating() {
  const { user } = useAuth();
  const email = (user?.email || "").toLowerCase();
  const userId = user?.id ?? null;
  const [supabase] = useState(() => createClient());
  // The browser client is a singleton sharing one realtime socket, and
  // this hook mounts in several components at once — same-name channels
  // on one socket collide (a later join closes the earlier one), so
  // each hook instance subscribes under its own unique topic.
  const [channelId] = useState(() => Math.random().toString(36).slice(2));
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
  // this account's real profiles row as soon as it's known, then keep it
  // fresh via the realtime stream on that same row.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    function apply(row: { plan?: string | null; features?: Partial<Record<FeatureKey, boolean>> | null; trial_ends_at?: string | null } | null) {
      setRemote({
        plan: normalizePlan(row?.plan),
        features: row?.features ?? null,
        trialEndsAt: row?.trial_ends_at ?? null,
      });
    }

    supabase
      .from("profiles")
      .select("plan, features, trial_ends_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) apply(data);
      });

    const channel = supabase
      .channel(`profile-${userId}-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && typeof payload.new === "object") apply(payload.new as Parameters<typeof apply>[0]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, channelId]);

  return useMemo(() => {
    const isAdmin = ADMIN_EMAILS.includes(email);
    const planKey: PlanKey = remote?.plan ?? "trial";
    const trialEndsAt = remote?.trialEndsAt ?? null;
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
    return { isAdmin, myFeatures, planKey, planLabel: planLabel(planKey), trialEndsAt, featureOn, loaded: remote !== null };
  }, [email, remote]);
}

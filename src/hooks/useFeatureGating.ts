"use client";

import { useMemo } from "react";
import { useAuth } from "./useAuth";
import {
  ADMIN_EMAILS,
  FeatureKey,
  loadAccessFor,
  planFor,
  planLabel,
} from "@/lib/featureGating";

/* Direct replacement for js/app.js's FEATURE GATING section (IS_ADMIN,
   featureOn(), myFeatures). */
export function useFeatureGating() {
  const { user } = useAuth();
  const email = (user?.email || "").toLowerCase();

  return useMemo(() => {
    const isAdmin = ADMIN_EMAILS.includes(email);
    const myFeatures = loadAccessFor(email).features;
    const planKey = planFor(myFeatures);

    function featureOn(key: string) {
      if (isAdmin) return true;
      if (!(key in myFeatures)) return true; // non-gateable routes (dashboard, activity, settings)
      return myFeatures[key as FeatureKey];
    }

    return { isAdmin, myFeatures, planKey, planLabel: planLabel(planKey), featureOn };
  }, [email]);
}

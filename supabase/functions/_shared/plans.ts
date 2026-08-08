// BSL 2.0 — plan → feature-flag seeding, shared by provision-profile
// (signup) and stripe-checkout confirm/sync (paid plan changes).
//
// Mirrors src/lib/featureGating.ts's FEATURES/PLANS in the frontend
// repo — kept in sync BY HAND, same as every other cross-repo constant
// here (see the header comment in _shared/limits.ts).

export const FEATURE_KEYS = [
  "agent",
  "assistants",
  "logs",
  "tools",
  "integrations",
  "calls",
  "onboarding",
  "assets",
  "brible",
  "creative",
  "images",
  "videos",
];

// Single-plan model: both the 7-day trial and pro include every
// feature. null = "no override" (full access) — admins can still
// hand-toggle individual features from the Client access page.
export function featuresForPlan(_plan: string): Record<string, boolean> | null {
  return null;
}

// Per-tier assistant-creation caps. The ENFORCED copy is migration
// 0011's enforce_assistant_limit() trigger — assistants are inserted
// straight from the browser under RLS, so only the DB can really say
// no. This constant (and src/lib/featureGating.ts's ASSISTANT_LIMITS)
// exists for messaging; keep all three in sync by hand.
export const PLAN_ASSISTANT_LIMITS: Record<string, number> = {
  trial: 2,
  pro: 10,
};

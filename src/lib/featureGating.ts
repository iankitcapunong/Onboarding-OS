/* Ported 1:1 from js/app.js's FEATURE GATING / CREDITS sections. Admins
   decide which features each client account gets; a feature switched off
   disappears from that client's sidebar and its route falls back to the
   dashboard. Admins always keep every feature and are unmetered.

   Per-account plan/features live server-side in Supabase's `profiles`
   table now (see src/hooks/useFeatureGating.ts and
   src/app/app/access/page.tsx) — this file only holds the shared
   definitions (feature keys, plan presets, costs) both the client and
   the Supabase Edge Functions need to agree on. */

export const ADMIN_EMAILS: string[] = ["bryansumait.contact@gmail.com"];

// "playground" and "deploy" stay in the union so features blobs stored
// before the Assistants tab replaced those two routes still typecheck —
// they're gone from FEATURES below, and useFeatureGating maps the old
// keys onto their successors.
export type FeatureKey =
  | "agent"
  | "playground"
  | "deploy"
  | "assistants"
  | "logs"
  | "tools"
  | "integrations"
  | "calls"
  | "onboarding"
  | "assets"
  | "creative"
  | "images"
  | "videos";

export const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: "agent", label: "Onboarding agent" },
  { key: "assistants", label: "Assistants" },
  { key: "logs", label: "Agent logs" },
  { key: "tools", label: "Tools" },
  { key: "integrations", label: "Integrations" },
  { key: "calls", label: "Call logs" },
  { key: "onboarding", label: "Onboarding logs" },
  { key: "assets", label: "Assets" },
  { key: "creative", label: "Creative ads" },
  { key: "images", label: "Image studio" },
  { key: "videos", label: "Video studio" },
];

// A features blob written before the Assistants/Logs/Tools/Integrations
// tabs existed has no entry for them — inherit the nearest legacy flag
// (first alias that's explicitly set wins) instead of defaulting a
// gated-off account to visible.
export const LEGACY_FEATURE_ALIASES: Partial<Record<FeatureKey, FeatureKey[]>> = {
  assistants: ["playground", "deploy"],
  logs: ["calls"],
  integrations: ["deploy"],
};

/* Single-plan model: every account starts a 7-day free trial with a
   one-time pot of 3000 credits (no card), and the only paid plan is
   Pro. The server mirror lives in supabase/functions/_shared/limits.ts
   (PLAN_CREDITS / normalizePlan) — keep in sync by hand. */
export type PlanKey = "trial" | "pro";

export const TRIAL_DAYS = 7;

export const PLAN_CREDITS: Record<PlanKey, number> = { trial: 3000, pro: 10000 };

// Legacy starter/growth/full/custom rows written before the single-plan
// switch read as a trial; only a Stripe-confirmed 'pro' is pro.
export function normalizePlan(plan: string | null | undefined): PlanKey {
  return plan === "pro" ? "pro" : "trial";
}

// Two-tier pricing: features that call a real, costly upstream API
// (video generation, the assistant prompt rewrite) charge 50;
// everything else charges 10. Mirrored server-side in each Edge
// Function's own cost table (supabase/functions/*/index.ts — imagegen's
// FLAT_COST, credits/index.ts's KIND_COST, videogen's FLAT_COST,
// brible's MODE_COST) since that's the actual enforcement point; this
// copy only drives the client's optimistic pre-check and "not enough
// credits" messaging. Keep these numbers in sync by hand — there's no
// shared source between the two repos, and a mismatch is exactly what
// causes the client and server credit counts to drift apart.
const LOW_COST = 10;
const HIGH_COST = 50;
export const CREDIT_COSTS: Record<string, number> = {
  asset: LOW_COST,
  creative: LOW_COST,
  images: LOW_COST,
  videos: HIGH_COST,
  // The Brible website builder is gone, but the `brible` Edge Function
  // still serves the Assistants tab's "rewrite this prompt with AI"
  // action (mode: "rewrite-prompt"), which spends under this key.
  brible: HIGH_COST,
};

export function planLabel(key: PlanKey | null) {
  return key === "pro" ? "Pro" : "Free trial";
}

/* Per-tier assistant-creation caps. The ENFORCED copy is the
   enforce_assistant_limit() DB trigger (supabase migration 0011) —
   assistants are inserted straight from the browser under RLS, so only
   the database can really say no. This mirror (and _shared/plans.ts's
   PLAN_ASSISTANT_LIMITS) drives the friendly pre-check + upgrade
   messaging; keep all three in sync by hand. Admins are exempt. */
export const ASSISTANT_LIMITS: Record<PlanKey, number> = { trial: 2, pro: 10 };

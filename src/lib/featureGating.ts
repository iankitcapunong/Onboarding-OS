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

/* Features that launch disabled: clients only get these once an admin
   explicitly switches them on in Client Access (the Aug 6 launch review
   parked Creative Ads as a future fulfillment upsell — unproven
   performance). Admins bypass gating entirely, so they still see and
   use these routes. An explicit admin toggle — on OR off — always wins
   over this default. */
export const DEFAULT_OFF_FEATURES: FeatureKey[] = ["creative"];

export function featureDefault(key: FeatureKey): boolean {
  return !DEFAULT_OFF_FEATURES.includes(key);
}

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

/* Per-model surcharges for the video studio. Video is the one feature
   whose upstream price swings by 5x between models, so the flat
   CREDIT_COSTS.videos can't cover it: Veo 3.1 costs kie.ai $2.00 a
   render while every other model runs $0.40. At the flat 50 credits
   (≈$0.49 of plan value) each premium render lost ≈$1.50, so the
   2026-08-07 pricing call repriced it rather than dropping the model.

   Keyed by the UPSTREAM kie.ai model string — VideoModel.veoModel on the
   veo API, VideoModel.model on the jobs API — because that's the one
   identifier the server also sees, on the request body it proxies.
   MIRRORED SERVER-SIDE in supabase/functions/videogen/index.ts's
   VIDEO_MODEL_COSTS, which is the actual enforcement point; this copy
   drives the optimistic pre-check and the price on the model picker.
   Keep them in sync by hand — same trap as CREDIT_COSTS above.

   Anything absent falls back to CREDIT_COSTS.videos, so a NEW premium
   model must be added here (and server-side) or it underbills. */
export const VIDEO_MODEL_COSTS: Record<string, number> = {
  veo3: 250,
};

/* Per-field ceilings for a published assistant. Every /talk turn feeds
   these to the model and bills the same flat rate whatever their size, so
   without a cap one account could drive real API spend inside its own
   credit allowance. ENFORCED in the database by the
   agent_deployments_prompt_size constraint (migration 0012) — publishing
   is a direct browser insert, so that is the only place it can't be
   skipped; these values exist to stop the editor from letting someone
   type past it and meet a raw constraint error on save. Keep in sync. */
export const FIELD_LIMITS = {
  persona: 4000,
  prompt: 12000,
  voice: 2000,
  first_message: 2000,
} as const;

export function videoCreditCost(upstreamModel: string | null | undefined): number {
  const premium =
    upstreamModel && Object.prototype.hasOwnProperty.call(VIDEO_MODEL_COSTS, upstreamModel)
      ? VIDEO_MODEL_COSTS[upstreamModel]
      : undefined;
  return typeof premium === "number" ? premium : CREDIT_COSTS.videos;
}

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

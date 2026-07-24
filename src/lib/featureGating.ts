import { getJSON, scopedKey, setJSON } from "./storage";

/* Ported 1:1 from js/app.js's FEATURE GATING / CREDITS sections. Admins
   decide which features each client account gets; a feature switched off
   disappears from that client's sidebar and its route falls back to the
   dashboard. Admins always keep every feature and are unmetered. */

export const ADMIN_EMAILS: string[] = ["bryansumait.contact@gmail.com"];

export type FeatureKey =
  | "agent"
  | "playground"
  | "calls"
  | "onboarding"
  | "assets"
  | "social"
  | "brible"
  | "creative"
  | "images"
  | "videos";

export const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: "agent", label: "Onboarding agent" },
  { key: "playground", label: "Prompt playground" },
  { key: "calls", label: "Call logs" },
  { key: "onboarding", label: "Onboarding logs" },
  { key: "assets", label: "Assets" },
  { key: "social", label: "Social studio" },
  { key: "brible", label: "Brible websites" },
  { key: "creative", label: "Creative ads" },
  { key: "images", label: "Image studio" },
  { key: "videos", label: "Video studio" },
];

export type PlanKey = "starter" | "growth" | "full" | "custom";

export const PLANS: { key: Exclude<PlanKey, "custom">; label: string; features: FeatureKey[] }[] = [
  { key: "starter", label: "Starter", features: ["agent", "calls", "assets"] },
  { key: "growth", label: "Growth", features: ["agent", "calls", "assets", "playground", "brible", "creative"] },
  { key: "full", label: "Full access", features: FEATURES.map((f) => f.key) },
];

export const PLAN_CREDITS: Record<PlanKey, number> = { starter: 250, growth: 1000, full: 3000, custom: 1000 };

// Two-tier pricing: features that call a real, costly upstream API
// (video generation, brible's multi-call LLM pipeline) charge 50;
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
  social: LOW_COST,
  creative: LOW_COST,
  images: LOW_COST,
  videos: HIGH_COST,
  brible: HIGH_COST,
};

type StoredAccess = { plan?: PlanKey; features?: Partial<Record<FeatureKey, boolean>> } | Partial<Record<FeatureKey, boolean>> | null;

function featureStoreKey(email: string) {
  return scopedKey("bsl_features", email);
}

/* Missing/unknown feature keys default to enabled, so new features roll
   out to everyone until an admin turns them off. */
export function loadAccessFor(email: string) {
  const raw = getJSON<StoredAccess>(featureStoreKey(email));
  const rawPlan = raw && "plan" in raw ? raw.plan : undefined;
  const preset = rawPlan ? PLANS.find((p) => p.key === rawPlan) : undefined;
  const src = raw && "features" in raw ? raw.features : (raw as Partial<Record<FeatureKey, boolean>> | null);

  const flags = {} as Record<FeatureKey, boolean>;
  FEATURES.forEach((f) => {
    flags[f.key] = preset ? preset.features.includes(f.key) : !src || src[f.key] !== false;
  });

  return { plan: rawPlan ?? null, features: flags, exists: !!raw };
}

export function saveAccessFor(email: string, plan: PlanKey | null, flags: Record<FeatureKey, boolean>) {
  setJSON(featureStoreKey(email), { plan, features: flags });
}

export function planFor(flags: Record<FeatureKey, boolean>): PlanKey {
  for (const p of PLANS) {
    const match = FEATURES.every((f) => flags[f.key] === p.features.includes(f.key));
    if (match) return p.key;
  }
  return "custom";
}

export function planLabel(key: PlanKey | null) {
  const plan = PLANS.find((p) => p.key === key);
  return plan?.label ?? "Custom";
}

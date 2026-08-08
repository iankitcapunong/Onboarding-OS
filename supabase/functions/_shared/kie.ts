// BSL 2.0 — shared kie.ai proxy rules for imagegen and videogen.
//
// Both functions proxy the same upstream host, and two of their routes
// are literally the same endpoint (/api/v1/jobs/createTask serves image
// AND video models). Before this module they each priced that endpoint
// from their own flat constant, so a caller could pick which price to
// pay simply by choosing which function to call — a video model routed
// through imagegen billed 10 instead of 50, and a path that resolved to
// the Veo endpoint billed 10 instead of 250.
//
// Two rules fix that, and both live here so the two functions cannot
// drift apart again:
//
//   1. Price follows the MODEL, not the function. Where a route carries
//      a model in its body, cost comes from MODEL_COSTS below.
//   2. Paths are resolved before they are matched, and matched exactly.
//      A prefix test on a raw string is not a safe allowlist:
//      "/api/v1/jobs/createTask/../../veo/generate" starts with an
//      allowed prefix but resolves to a different, dearer endpoint.

// Per-render credit prices, keyed by the upstream kie.ai model string —
// the one identifier both this proxy and the browser agree on.
// MIRRORED CLIENT-SIDE in src/lib/featureGating.ts (CREDIT_COSTS.images,
// CREDIT_COSTS.videos, VIDEO_MODEL_COSTS) and in the two model
// catalogues under src/components/videos/models.ts and
// src/app/app/images/page.tsx. Keep them in sync by hand.
//
// An unknown model is REJECTED rather than charged a default. Defaulting
// is what made the old code underbill: every model nobody had listed
// silently billed the cheapest rate. A missing entry here now fails
// loudly at generation time, which is the safe direction — if a new
// model is added to the client catalogue, add it here in the same change.
const IMAGE_COST = 10;
const VIDEO_COST = 50;

export const MODEL_COSTS: Record<string, number> = {
  // --- Image models (jobs API) ---
  "gpt-image-2-text-to-image": IMAGE_COST,
  "nano-banana-pro": IMAGE_COST,
  "nano-banana-2": IMAGE_COST,
  "google/nano-banana": IMAGE_COST,
  "seedream/4.5-text-to-image": IMAGE_COST,
  "bytedance/seedream-v4-text-to-image": IMAGE_COST,
  "flux-2/pro-text-to-image": IMAGE_COST,
  "google/imagen4": IMAGE_COST,
  "ideogram/v3-text-to-image": IMAGE_COST,
  "ideogram/character": IMAGE_COST,
  "qwen/image-edit": IMAGE_COST,
  "z-image": IMAGE_COST,

  // --- Video models (jobs API) ---
  "kling-3.0/video": VIDEO_COST,
  "kling-2.6/text-to-video": VIDEO_COST,
  "kling/v2-5-turbo-text-to-video-pro": VIDEO_COST,
  "kling/v2-1-master-text-to-video": VIDEO_COST,
  "wan/2-7-text-to-video": VIDEO_COST,
  "wan/2-5-text-to-video": VIDEO_COST,
  "wan/2-2-a14b-text-to-video-turbo": VIDEO_COST,
  "grok-imagine/text-to-video": VIDEO_COST,
  "bytedance/seedance-2": VIDEO_COST,
  "bytedance/seedance-1.5-pro": VIDEO_COST,
  "hailuo/2-3-image-to-video-pro": VIDEO_COST,

  // --- Video models (veo API) ---
  // Veo 3.1 Quality costs kie.ai $2.00 a render against $0.40 for
  // everything else; the 2026-08-07 pricing call repriced it rather than
  // dropping the model. At 100 credits it would still lose money.
  "veo3": 250,
  "veo3_fast": VIDEO_COST,
};

/** Credits for a model, or null when we don't recognise it. */
export function costForModel(model: unknown): number | null {
  if (typeof model !== "string") return null;
  // The model string is client-supplied: a bare index reaches
  // Object.prototype, where "toString" yields a truthy function that
  // would sail into the credit arithmetic as the cost.
  if (!Object.prototype.hasOwnProperty.call(MODEL_COSTS, model)) return null;
  const cost = MODEL_COSTS[model];
  return typeof cost === "number" && Number.isInteger(cost) && cost > 0 ? cost : null;
}

export type KieRoute = {
  method: "GET" | "POST";
  /** Exact pathname — no prefixes, no wildcards. */
  path: string;
  /** A number bills that flat; "by-model" reads the cost off body.model. */
  cost: number | "by-model";
  rateBucket: string;
  rateLimit: number;
};

/**
 * Resolve a caller-supplied path against the kie.ai origin and hand back
 * its normalised pathname + query, or null if it isn't a plain absolute
 * path on that host. Rejecting "//" keeps a protocol-relative URL from
 * moving the request to another origin.
 */
export function resolveKiePath(base: string, raw: unknown): { pathname: string; search: string } | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(base + raw);
  } catch {
    return null;
  }
  if (url.origin !== new URL(base).origin) return null;
  return { pathname: url.pathname, search: url.search };
}

/** Exact method+pathname match against the allowlist. */
export function matchKieRoute(routes: KieRoute[], method: "GET" | "POST", pathname: string): KieRoute | null {
  return routes.find((r) => r.method === method && r.path === pathname) ?? null;
}

/**
 * What this request costs. Model-priced routes read body.model, so the
 * charge tracks the work kie.ai is about to do rather than the function
 * the caller happened to enter through. Returns null when the route is
 * model-priced but the model is unknown — the caller should reject.
 */
export function costForRequest(route: KieRoute, proxiedBody: unknown): number | null {
  if (route.cost !== "by-model") return route.cost;
  const model = proxiedBody && typeof proxiedBody === "object"
    ? (proxiedBody as { model?: unknown }).model
    : undefined;
  return costForModel(model);
}

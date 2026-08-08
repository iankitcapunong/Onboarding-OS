// BSL 2.0 — Generic credit-metering Edge Function.
//
// Creative ads and Assets build their output entirely client-side
// (spintax/template HTML, no LLM or third-party API) — unlike brible/
// imagegen/videogen, there's no upstream call to proxy. But the credit
// spend still needs to be enforced server-side, or a user can just edit
// the bsl_credits value in localStorage to get unlimited generates.
// This function's only job is requireUser() -> checkRate() ->
// checkAndSpendCredits() for those kinds, returning the same
// `{ remaining }` shape every other Edge Function already echoes back.
//
// Deploy:
//   supabase functions deploy credits

import { getAdminClient, requireUser, checkRate, checkAndSpendCredits, getPlan } from "../_shared/limits.ts";

// Mirrors src/lib/featureGating.ts's CREDIT_COSTS — asset/creative are
// both client-side templating with no upstream API, so they're on the
// low tier. Applies per unit (e.g. per asset type selected).
const LOW_COST = 10;
const KIND_COST: Record<string, number> = {
  asset: LOW_COST,
  creative: LOW_COST,
};
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 300;
const MAX_COUNT = 20;

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") || "*")
  .split(",").map((s) => s.trim()).filter(Boolean);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "null");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  function json(payload: unknown, status: number): Response {
    return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = getAdminClient();
  const user = await requireUser(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { kind?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const kind = String(body.kind || "");
  const perUnitCost = KIND_COST[kind];
  if (!perUnitCost) return json({ error: "unknown_kind" }, 400);

  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(body.count) || 1)));
  const cost = perUnitCost * count;

  const rate = await checkRate(admin, user.id, `credits:${kind}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!rate.ok) return json(rate.body, rate.status);

  const plan = await getPlan(admin, user.id);
  const credit = await checkAndSpendCredits(admin, user.id, plan, cost);
  if (!credit.ok) return json(credit.body, credit.status);

  return json({ remaining: credit.remaining }, 200);
});

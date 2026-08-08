// BSL 2.0. Supabase Edge Function — kie.ai image-generation proxy.
//
// js/imagegen.js used to call https://api.kie.ai directly from the
// browser with a hardcoded workspace key ("DEFAULT_KEY") — that key was
// shipped to every visitor, and the calls needed no login at all. This
// function is the fix: the key lives only in this function's secrets,
// the caller must present a valid Supabase JWT, and every call is rate
// limited + billed against the caller's monthly credit allowance before
// it's allowed to reach kie.ai.
//
// The client still decides which kie.ai path/model to call (see
// js/imagegen.js's createTask/checkTask) — it just calls this function
// instead of api.kie.ai directly, passing { method, path, body }. This
// function only forwards requests whose path matches ALLOWED_ROUTES, so
// it can't be used as an open relay to arbitrary kie.ai endpoints.
//
// Deploy:
//   supabase secrets set KIE_API_KEY=<new, rotated kie.ai workspace key>
//   supabase functions deploy imagegen

import { getAdminClient, requireUser, checkRate, checkAndSpendCredits, getPlan } from "../_shared/limits.ts";
import { type KieRoute, costForRequest, matchKieRoute, resolveKiePath } from "../_shared/kie.ts";

const KIE_API_BASE = "https://api.kie.ai";
const RATE_WINDOW_SECONDS = 300;

// Exact method+pathname -> credit cost. The two fixed-model endpoints
// bill the flat image rate; /api/v1/jobs/createTask serves image AND
// video models, so it prices off the requested model (see _shared/kie.ts)
// — otherwise a video render bought through this function would cost a
// fifth of what the same render costs through videogen. Status polls stay
// free (not a new "use" of the feature) but are still rate limited so a
// runaway poll loop can't hammer this function.
const ALLOWED_ROUTES: KieRoute[] = [
  { method: "POST", path: "/api/v1/gpt4o-image/generate", cost: 10, rateBucket: "imagegen:create", rateLimit: 15 },
  { method: "GET", path: "/api/v1/gpt4o-image/record-info", cost: 0, rateBucket: "imagegen:poll", rateLimit: 300 },
  { method: "POST", path: "/api/v1/flux/kontext/generate", cost: 10, rateBucket: "imagegen:create", rateLimit: 15 },
  { method: "GET", path: "/api/v1/flux/kontext/record-info", cost: 0, rateBucket: "imagegen:poll", rateLimit: 300 },
  { method: "POST", path: "/api/v1/jobs/createTask", cost: "by-model", rateBucket: "imagegen:create", rateLimit: 15 },
  { method: "GET", path: "/api/v1/jobs/recordInfo", cost: 0, rateBucket: "imagegen:poll", rateLimit: 300 },
];

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

  let body: { method?: string; path?: string; body?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const method = body.method === "GET" ? "GET" : "POST";
  const target = resolveKiePath(KIE_API_BASE, body.path);
  if (!target) return json({ error: "path_not_allowed" }, 400);
  const route = matchKieRoute(ALLOWED_ROUTES, method, target.pathname);
  if (!route) return json({ error: "path_not_allowed" }, 400);

  const rate = await checkRate(admin, user.id, route.rateBucket, route.rateLimit, RATE_WINDOW_SECONDS);
  if (!rate.ok) return json(rate.body, rate.status);

  // Unknown model on a model-priced route: refuse rather than fall back
  // to a default, which is how the old flat rate underbilled.
  const cost = costForRequest(route, body.body);
  if (cost === null) return json({ error: "unknown_model" }, 400);

  let remaining: number | undefined;
  if (cost > 0) {
    const plan = await getPlan(admin, user.id);
    const credit = await checkAndSpendCredits(admin, user.id, plan, cost);
    if (!credit.ok) return json(credit.body, credit.status);
    remaining = credit.remaining;
  }

  const key = Deno.env.get("KIE_API_KEY");
  if (!key) return json({ error: "KIE_API_KEY secret is not set" }, 500);

  const init: RequestInit = { method, headers: { Authorization: "Bearer " + key } };
  if (method === "POST") {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(body.body ?? {});
  }

  // Forward the RESOLVED path, so what we billed is what kie.ai runs.
  const upstream = await fetch(KIE_API_BASE + target.pathname + target.search, init);
  const text = await upstream.text();
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "upstream_parse_failed", detail: text.slice(0, 200) }, 502);
  }
  if (payload && typeof payload === "object" && remaining !== undefined) {
    payload._bslRemaining = remaining;
  }
  return json(payload, upstream.status);
});

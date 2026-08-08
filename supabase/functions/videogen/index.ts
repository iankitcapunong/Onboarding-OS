// BSL 2.0. Supabase Edge Function — kie.ai video-generation proxy.
// Same rationale and shape as supabase/functions/imagegen/index.ts —
// see that file's header comment. js/videogen.js calls this instead of
// api.kie.ai directly, so the workspace key never reaches the browser.
//
// Deploy:
//   supabase secrets set KIE_API_KEY=<new, rotated kie.ai workspace key>
//   supabase functions deploy videogen

import { getAdminClient, requireUser, checkRate, checkAndSpendCredits, getPlan } from "../_shared/limits.ts";
import { type KieRoute, costForRequest, matchKieRoute, resolveKiePath } from "../_shared/kie.ts";

const KIE_API_BASE = "https://api.kie.ai";
const RATE_WINDOW_SECONDS = 300;

// Both create routes price off the requested model — the veo endpoint
// because Veo 3.1 Quality costs kie.ai five times what the fast models
// do, and the jobs endpoint because imagegen serves that same path for
// image models. The table lives in _shared/kie.ts so the two proxies
// can't drift into charging different prices for the same render.
// Status polls stay free but are still rate limited.
const ALLOWED_ROUTES: KieRoute[] = [
  { method: "POST", path: "/api/v1/veo/generate", cost: "by-model", rateBucket: "videogen:create", rateLimit: 10 },
  { method: "GET", path: "/api/v1/veo/record-info", cost: 0, rateBucket: "videogen:poll", rateLimit: 300 },
  { method: "POST", path: "/api/v1/jobs/createTask", cost: "by-model", rateBucket: "videogen:create", rateLimit: 10 },
  { method: "GET", path: "/api/v1/jobs/recordInfo", cost: 0, rateBucket: "videogen:poll", rateLimit: 300 },
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

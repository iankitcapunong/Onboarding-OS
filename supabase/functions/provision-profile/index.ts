// BSL 2.0 — Provisions a brand-new account's profile row at signup.
//
// Single-plan model: every new account starts a 7-day free trial with
// 3000 credits — the plan is always 'trial' here, and trial_ends_at is
// stamped by the column default (now() + 7 days) on insert. The ONLY
// path to 'pro' is stripe-webhook confirming a paid subscription.
//
// Only the FIRST call for a given account does anything: the upsert
// below is INSERT ... ON CONFLICT (user_id) DO NOTHING, so calling it
// again later can't restart an expired trial.
//
// Deploy:
//   supabase functions deploy provision-profile

import { getAdminClient, requireUser, checkRate } from "../_shared/limits.ts";

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

  // Provisioning is a once-per-account upsert; anything past a handful
  // of calls in a window is a script, not a signup flow.
  const rate = await checkRate(admin, user.id, "provision-profile", 10, 300);
  if (!rate.ok) return json(rate.body, rate.status);

  // The body's requested plan is ignored — signup can only ever start
  // a trial. Kept as a parse step so old clients posting {plan} still
  // get a clean envelope back rather than a 400.
  try {
    await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { error: upsertErr } = await admin
    .from("profiles")
    .upsert({ user_id: user.id, plan: "trial", features: null }, { onConflict: "user_id", ignoreDuplicates: true });
  if (upsertErr) return json({ error: "provision_failed", detail: upsertErr.message }, 500);

  const { data: row, error: selErr } = await admin
    .from("profiles")
    .select("plan, trial_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (selErr || !row) return json({ error: "provision_failed", detail: selErr?.message ?? "no row found" }, 500);

  return json({ plan: row.plan, trialEndsAt: row.trial_ends_at }, 200);
});

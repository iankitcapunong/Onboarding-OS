// BSL 2.0 — admin-only client roster + feature/plan management.
//
// The "Client access" page used to only see/manage whatever had been
// poked at in the ADMIN's OWN browser localStorage — never a real
// client's own account. This function is the real, server-verified
// source: `list` enumerates every actually-registered Supabase Auth
// user (left-joined with their profiles row), `set` writes a target
// user's plan/features. Both actions are gated against the server-side
// ADMIN_EMAILS mirror in _shared/admin.ts — never a client-supplied
// "am I admin" flag.
//
// Deploy:
//   supabase functions deploy admin-clients

import { getAdminClient, requireUser, checkRate, PLAN_CREDITS, normalizePlan, creditsBucketFor, currentCreditsBucket } from "../_shared/limits.ts";
import { isAdminEmail } from "../_shared/admin.ts";

const KNOWN_PLANS = ["trial", "pro"];

// Admin credit nudges land in the same usage_counters bucket real
// spends do (see checkAndSpendCredits in _shared/limits.ts — monthly
// for pro, the lifetime trial pot otherwise), just moved by an admin
// instead of an API call. p_limit is a no-op ceiling here — admin
// grants aren't rate-limited by their own action — kept comfortably
// inside int4 range.
const ADMIN_ADJUST_LIMIT = 1_000_000_000;

function creditsFor(plan: string, used: number) {
  const allowance = PLAN_CREDITS[normalizePlan(plan)];
  return { allowance, used, remaining: Math.max(0, allowance - used) };
}

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

type ProfileRow = { user_id: string; plan: string; features: Record<string, boolean> | null };

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
  if (!isAdminEmail(user.email)) return json({ error: "forbidden" }, 403);

  // Admin-only, but still bounded — a leaked admin session (or a busted
  // dashboard loop) shouldn't be able to hammer plan/credit writes.
  const rate = await checkRate(admin, user.id, "admin-clients", 60, 300);
  if (!rate.ok) return json(rate.body, rate.status);

  let body: { action?: string; userId?: string; plan?: string; features?: Record<string, boolean> | null; amount?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body.action === "list") {
    const authUsers: { id: string; email: string | null; created_at: string }[] = [];
    let page = 1;
    const perPage = 200;
    // deno-lint-ignore no-constant-condition
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return json({ error: "list_failed", detail: error.message }, 500);
      const pageUsers = data?.users ?? [];
      authUsers.push(...pageUsers.map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at })));
      if (pageUsers.length < perPage) break;
      page += 1;
    }

    const { data: profileRows, error: profileErr } = await admin
      .from("profiles")
      .select("user_id, plan, features");
    if (profileErr) return json({ error: "list_failed", detail: profileErr.message }, 500);

    // Each user's live balance sits in a plan-dependent bucket — the
    // monthly ledger for pro, the lifetime trial pot for everyone else
    // — so fetch both and pick per user below.
    const { data: usageRows, error: usageErr } = await admin
      .from("usage_counters")
      .select("user_id, bucket, count")
      .in("bucket", [currentCreditsBucket(), "credits:trial"]);
    if (usageErr) return json({ error: "list_failed", detail: usageErr.message }, 500);

    const profileByUser = new Map<string, ProfileRow>((profileRows ?? []).map((r: ProfileRow) => [r.user_id, r]));
    const usedByUser = new Map<string, number>(
      (usageRows ?? []).map((r: { user_id: string; bucket: string; count: number }) => [`${r.user_id}|${r.bucket}`, r.count])
    );

    const clients = authUsers
      .filter((u) => !!u.email)
      .map((u) => {
        const row = profileByUser.get(u.id);
        const plan = normalizePlan(row?.plan);
        return {
          userId: u.id,
          email: (u.email as string).toLowerCase(),
          plan,
          features: row?.features ?? null,
          credits: creditsFor(plan, usedByUser.get(`${u.id}|${creditsBucketFor(plan)}`) ?? 0),
        };
      });

    return json({ clients }, 200);
  }

  if (body.action === "adjustCredits") {
    const userId = String(body.userId || "");
    const amount = Math.trunc(Number(body.amount));
    if (!userId) return json({ error: "invalid_userId" }, 400);
    if (!Number.isFinite(amount) || amount === 0) return json({ error: "invalid_amount" }, 400);

    // Which bucket to move depends on the target's plan, so resolve
    // that first. Adding credits lowers the recorded usage (and vice
    // versa) so the exact same allowance-minus-usage math everywhere
    // else picks it up automatically — no separate "adjustment" field.
    const { data: profRow, error: profErr } = await admin
      .from("profiles")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) return json({ error: "adjust_failed", detail: profErr.message }, 500);
    const plan = normalizePlan(profRow?.plan);

    const { data, error } = await admin.rpc("increment_usage", {
      p_user_id: userId,
      p_bucket: creditsBucketFor(plan),
      p_limit: ADMIN_ADJUST_LIMIT,
      p_amount: -amount,
    });
    if (error) return json({ error: "adjust_failed", detail: error.message }, 500);
    const row = Array.isArray(data) ? data[0] : data;
    const used = row?.new_count ?? 0;

    return json({ userId, credits: creditsFor(plan, used) }, 200);
  }

  if (body.action === "set") {
    const userId = String(body.userId || "");
    if (!userId) return json({ error: "invalid_userId" }, 400);
    if (body.plan !== undefined && !KNOWN_PLANS.includes(body.plan)) {
      return json({ error: "invalid_plan" }, 400);
    }

    const patch: { plan?: string; features?: Record<string, boolean> | null } = {};
    if (body.plan !== undefined) patch.plan = body.plan;
    if (body.features !== undefined) patch.features = body.features;

    const { error: upsertErr } = await admin
      .from("profiles")
      .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
    if (upsertErr) return json({ error: "set_failed", detail: upsertErr.message }, 500);

    const { data: row, error: selErr } = await admin
      .from("profiles")
      .select("user_id, plan, features")
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr || !row) return json({ error: "set_failed", detail: selErr?.message ?? "no row found" }, 500);

    return json({ userId: row.user_id, plan: row.plan, features: row.features }, 200);
  }

  return json({ error: "unknown_action" }, 400);
});

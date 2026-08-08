// BSL 2.0 — shared auth/rate-limit/credit helper for Edge Functions.
//
// Every paid-API proxy (brible, imagegen, videogen, sheets-log) calls
// requireUser() -> checkRate() -> checkAndSpendCredits() in that order
// before doing any real work, so abuse is rejected before a single
// upstream API is ever called. Backed by the `profiles` / `usage_counters`
// tables and `increment_usage()` function from
// supabase/migrations/0001_profiles_and_usage.sql.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mirrors src/lib/featureGating.ts's PLAN_CREDITS — the real,
// server-enforced ceiling. Single-plan model: the trial's 3000 credits
// are a ONE-TIME pot for the 7-day window (no monthly reset); pro's
// allowance renews each calendar month.
export const PLAN_CREDITS: Record<string, number> = {
  trial: 3000,
  pro: 10000,
};

// Anything that isn't 'pro' — including legacy starter/growth/full/
// custom rows written before migration 0010 — is treated as a trial.
export function normalizePlan(plan: string | null | undefined): string {
  return plan === "pro" ? "pro" : "trial";
}

export function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export type AuthedUser = { id: string; email: string | null };

// Resolves the caller's user from the Authorization: Bearer <jwt> header.
// Returns null (caller should respond 401) if missing/invalid.
export async function requireUser(req: Request, admin: ReturnType<typeof getAdminClient>): Promise<AuthedUser | null> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export type LimitResult = { ok: true } | { ok: false; status: number; body: Record<string, unknown> };

// Fixed-window rate limit: at most `limit` calls to this `action` per
// `windowSeconds`, per user. Buckets by truncating the current time to
// the window size, so it's a simple fixed window (not sliding) — good
// enough to stop scripted bursts without extra bookkeeping.
export async function checkRate(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<LimitResult> {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const bucket = `rate:${action}:${windowStart}`;
  const { data, error } = await admin.rpc("increment_usage", {
    p_user_id: userId,
    p_bucket: bucket,
    p_limit: limit,
  });
  if (error) {
    return { ok: false, status: 500, body: { error: "rate_check_failed", detail: error.message } };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) {
    return {
      ok: false,
      status: 429,
      body: { error: "rate_limited", detail: `Too many requests — try again in a moment.`, retryAfterSeconds: windowSeconds },
    };
  }
  return { ok: true };
}

// The monthly bucket credits are ledgered under — "credits:YYYY-MM".
// Shared by checkAndSpendCredits (real spend) and admin-clients'
// adjustCredits action (admin grants/deductions), so both read and
// write the exact same counter instead of drifting apart.
export function currentCreditsBucket(): string {
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  return `credits:${month}`;
}

// Which counter a plan's credits live in. Trial credits are a single
// lifetime pot ("credits:trial") so a trial spanning a month boundary
// doesn't hand out a fresh allowance mid-trial; pro ledgers per month.
// Mirrored client-side in src/hooks/useCredits.tsx — keep in sync.
export function creditsBucketFor(plan: string): string {
  return normalizePlan(plan) === "pro" ? currentCreditsBucket() : "credits:trial";
}

// Credit ledger: `cost` credits against this user's plan allowance.
// Trial accounts are also checked against profiles.trial_ends_at —
// past it, every AI action is refused outright (402 trial_expired)
// regardless of remaining credits. Returns the remaining balance
// either way so the caller can echo it back to the client.
export async function checkAndSpendCredits(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  plan: string,
  cost: number,
): Promise<LimitResult & { remaining?: number }> {
  const normalized = normalizePlan(plan);
  if (normalized !== "pro") {
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("trial_ends_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) {
      return { ok: false, status: 500, body: { error: "credit_check_failed", detail: profErr.message } };
    }
    const endsAt = prof?.trial_ends_at ? new Date(prof.trial_ends_at) : null;
    if (endsAt && endsAt.getTime() <= Date.now()) {
      return {
        ok: false,
        status: 402,
        body: { error: "trial_expired", detail: "Your 7-day free trial has ended — upgrade to Pro to keep using AI features.", remaining: 0 },
        remaining: 0,
      };
    }
  }

  const allowance = PLAN_CREDITS[normalized];
  const bucket = creditsBucketFor(normalized);

  // A non-integer or non-positive cost means a caller computed a price
  // from something it shouldn't have. Refuse rather than send it to the
  // RPC, where NaN becomes null and trips a not-null constraint 500.
  if (!Number.isInteger(cost) || cost <= 0) {
    return { ok: false, status: 500, body: { error: "credit_spend_failed", detail: "invalid cost" } };
  }

  /* Spend first, then honour the verdict the database already computed.
     The previous shape — read the balance, compare, then increment — was
     three round-trips, so concurrent requests all read the same total,
     all decided they could afford it, and all spent: an overdraft on
     every paid path. increment_usage() does the add and the ceiling test
     in one statement and hands back `allowed`, which this function used
     to throw away. Now a rejected spend is refunded with a compensating
     negative amount, so the counter lands exactly where it started. */
  const { data, error } = await admin.rpc("increment_usage", {
    p_user_id: userId,
    p_bucket: bucket,
    p_limit: allowance,
    p_amount: cost,
  });
  if (error) {
    return { ok: false, status: 500, body: { error: "credit_spend_failed", detail: error.message } };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const newUsed = typeof row?.new_count === "number" ? row.new_count : allowance;

  if (row?.allowed === false) {
    const { error: refundErr } = await admin.rpc("increment_usage", {
      p_user_id: userId,
      p_bucket: bucket,
      p_limit: allowance,
      p_amount: -cost,
    });
    // A failed refund would leave the account short by this request's
    // cost. Nothing to do about it inline, but it must be visible.
    if (refundErr) console.error("credit refund failed:", refundErr.message);
    const remaining = Math.max(0, allowance - (newUsed - cost));
    const detail = normalized === "pro"
      ? `This needs ${cost} credits and you have ${remaining} left this month.`
      : `This needs ${cost} credits and you have ${remaining} trial credits left — upgrade to Pro for more.`;
    return {
      ok: false,
      status: 402,
      body: { error: "out_of_credits", detail, remaining },
      remaining,
    };
  }

  return { ok: true, remaining: Math.max(0, allowance - newUsed) };
}

// Looks up (or lazily provisions) this user's plan for credit checks.
// Signup normally inserts this row (provision-profile); this is just a
// safety net so an older account without one still gets the default
// trial (with trial_ends_at set by the column default) instead of
// every call failing.
export async function getPlan(admin: ReturnType<typeof getAdminClient>, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("plan").eq("user_id", userId).maybeSingle();
  if (data?.plan) return normalizePlan(data.plan);
  await admin.from("profiles").insert({ user_id: userId }).select().maybeSingle();
  return "trial";
}

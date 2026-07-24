import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeatureKey, PlanKey } from "./featureGating";

export class EdgeFunctionError extends Error {
  code?: string;
  remaining?: number;
  constructor(message: string, opts?: { code?: string; remaining?: number }) {
    super(message);
    this.code = opts?.code;
    this.remaining = opts?.remaining;
  }
}

/* Ported 1:1 from the SB.auth.getSession() + fetch(".../functions/v1/<name>")
   pattern repeated across app.js (bribleCallFn, sheetsFn) and
   imagegen.js/videogen.js (kieFn): attach the session's access token,
   parse the JSON envelope, and throw using the same error precedence
   (detail > error > "fn-<status>"). */
async function callEdgeFunction<T = unknown>(
  supabase: SupabaseClient,
  name: "brible" | "imagegen" | "videogen" | "sheets-log" | "credits" | "provision-profile" | "admin-clients",
  payload: unknown
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new EdgeFunctionError("not-signed-in");

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new EdgeFunctionError(data?.detail || data?.error || `fn-${res.status}`, {
      code: typeof data?.error === "string" ? data.error : undefined,
      remaining: typeof data?.remaining === "number" ? data.remaining : undefined,
    });
  }
  return data as T;
}

export function callSheetsLog<T = unknown>(supabase: SupabaseClient, sheet: string) {
  return callEdgeFunction<T>(supabase, "sheets-log", { sheet });
}

export function callBrible<T = { remaining?: number }>(supabase: SupabaseClient, payload: unknown) {
  return callEdgeFunction<T>(supabase, "brible", payload);
}

export function callImagegen<T = { remaining?: number }>(
  supabase: SupabaseClient,
  method: string,
  path: string,
  body?: unknown
) {
  return callEdgeFunction<T>(supabase, "imagegen", { method, path, body: body ?? null });
}

export function callVideogen<T = { remaining?: number }>(
  supabase: SupabaseClient,
  method: string,
  path: string,
  body?: unknown
) {
  return callEdgeFunction<T>(supabase, "videogen", { method, path, body: body ?? null });
}

// Server-side credit metering for features with no upstream API to
// proxy (creative ads, assets) — see supabase/functions/credits/index.ts.
export function callCredits<T = { remaining?: number }>(supabase: SupabaseClient, kind: string, count = 1) {
  return callEdgeFunction<T>(supabase, "credits", { kind, count });
}

// Sets the real, server-enforced plan for a brand-new account, based on
// what the signup/trial form computed from chosen add-ons — see
// supabase/functions/provision-profile/index.ts. Only takes effect on
// an account's first call (subsequent calls are a no-op server-side).
export function callProvisionProfile<T = { plan?: string }>(supabase: SupabaseClient, plan: string) {
  return callEdgeFunction<T>(supabase, "provision-profile", { plan });
}

export type ClientCredits = { allowance: number; used: number; remaining: number };

export type AdminClient = {
  userId: string;
  email: string;
  plan: PlanKey;
  features: Partial<Record<FeatureKey, boolean>> | null;
  credits: ClientCredits;
};

// Real, server-verified client roster for the admin "Client access"
// page — every actually-registered Supabase Auth user, left-joined
// with their profiles row if one exists. See
// supabase/functions/admin-clients/index.ts; admin-only, enforced
// server-side against a mirrored ADMIN_EMAILS list, never trusting a
// client-supplied "am I admin" flag.
export function callAdminClientsList<T = { clients: AdminClient[] }>(supabase: SupabaseClient) {
  return callEdgeFunction<T>(supabase, "admin-clients", { action: "list" });
}

export function callAdminClientsSet<T = AdminClient>(
  supabase: SupabaseClient,
  userId: string,
  patch: { plan?: PlanKey; features?: Partial<Record<FeatureKey, boolean>> | null }
) {
  return callEdgeFunction<T>(supabase, "admin-clients", { action: "set", userId, ...patch });
}

// Grants (positive amount) or deducts (negative amount) credits for this
// user's current billing month — see supabase/functions/admin-clients/
// index.ts's "adjustCredits" action, which moves the same usage_counters
// bucket real spends do.
export function callAdminClientsAdjustCredits<T = { userId: string; credits: ClientCredits }>(
  supabase: SupabaseClient,
  userId: string,
  amount: number
) {
  return callEdgeFunction<T>(supabase, "admin-clients", { action: "adjustCredits", userId, amount });
}

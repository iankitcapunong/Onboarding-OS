// lead-capture — Supabase Edge Function
// Public, unauthenticated endpoint behind the landing page's VSL lead
// modal. There is no signed-in visitor (it's the marketing page), so —
// like agent-talk — auth is the anon key alone and verify_jwt is false.
//
// Rate limiting can't reuse _shared/limits.ts's checkRate here: that
// keys usage_counters on a real auth.users id (FK-enforced) and an
// anonymous visitor has none. The leads table is the throttle instead,
// keyed on a salted hash of the submitter's IP (leads.ip_hash, migration
// 0012).
//
// It used to count EVERY row in the window regardless of who created it,
// which turned the throttle into the attack: twenty scripted submissions
// every five minutes and the landing page stops capturing real leads,
// silently, for everyone. A global ceiling remains as a backstop but it
// now fails OPEN — it logs and accepts rather than rejecting, because
// dropping a genuine lead is worse than recording a burst.
//
// Deploy (once, from this repo's root, with the Supabase CLI):
//   supabase functions deploy lead-capture --no-verify-jwt

import { getAdminClient } from "../_shared/limits.ts";

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_SOURCE_LENGTH = 40;
// Per submitter, not global.
const RATE_LIMIT = 5;
const GLOBAL_SOFT_LIMIT = 200;
const RATE_WINDOW_MINUTES = 5;

/* The raw IP is never stored — only a salted digest, so the throttle can
   recognise a repeat submitter without the leads table becoming a record
   of who visited the page. LEAD_IP_SALT keeps the digest from being
   reversible by rainbow table; absent, we fall back to a build-time
   constant, which still beats storing addresses. */
const IP_SALT = Deno.env.get("LEAD_IP_SALT") || "bsl-lead-capture-v1";

async function hashIp(req: Request): Promise<string | null> {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip")?.trim() || "";
  if (!ip) return null;
  const bytes = new TextEncoder().encode(IP_SALT + ":" + ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

interface LeadBody {
  name?: string;
  email?: string;
  source?: string;
}

function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  function json(payload: unknown, status: number): Response {
    return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: LeadBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const name = (body.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
  const email = (body.email ?? "").trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
  const source = (body.source ?? "video").trim().slice(0, MAX_SOURCE_LENGTH) || "video";
  if (!name) return json({ error: "missing_name" }, 400);
  if (!validEmail(email)) return json({ error: "invalid_email" }, 400);

  const admin = getAdminClient();

  const windowStart = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
  const ipHash = await hashIp(req);

  // Per-submitter ceiling — the one that actually rejects.
  if (ipHash) {
    const { count, error: mineErr } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", windowStart);
    if (mineErr) return json({ error: "lookup_failed", detail: mineErr.message }, 500);
    if ((count ?? 0) >= RATE_LIMIT) return json({ error: "rate_limited" }, 429);
  }

  // Global backstop — visibility only. Rejecting here is what let one
  // script shut the funnel, so an unusual burst is logged and accepted.
  const { count: total } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .gte("created_at", windowStart);
  if ((total ?? 0) >= GLOBAL_SOFT_LIMIT) {
    console.warn(`lead-capture: ${total} leads in the last ${RATE_WINDOW_MINUTES}m — accepting, but worth a look`);
  }

  /* ignoreDuplicates, not an upsert on email: overwriting let anyone who
     guessed a captured lead's address rewrite that lead's name and
     source. A repeat submission from a real visitor is a no-op, which is
     the right outcome — we already have them. */
  const { error: insertErr } = await admin
    .from("leads")
    .upsert(
      { name, email, source, ip_hash: ipHash, updated_at: new Date().toISOString() },
      { onConflict: "email", ignoreDuplicates: true }
    );
  if (insertErr) return json({ error: "save_failed", detail: insertErr.message }, 500);

  return json({ ok: true }, 200);
});

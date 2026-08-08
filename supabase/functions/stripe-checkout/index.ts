// stripe-checkout — Supabase Edge Function
// Creates Stripe Checkout / Billing Portal sessions for the signed-in
// account. The frontend never touches Stripe directly (no publishable
// key, no Stripe.js) — it calls this, gets back a URL, and redirects.
//
// Actions (single-fn CRUD convention, like admin-clients):
//   { action: "subscribe" }                          -> { url }  (Pro)
//   { action: "topup", pack: "small"|"large" }       -> { url }
//   { action: "portal" }                             -> { url }
//   { action: "confirm", session_id }                -> { ok, ... }
//   { action: "sync" }                               -> { ok, plan }
//
// No webhook: payment confirmation is pull, not push. Stripe sends the
// customer back with ?session_id={CHECKOUT_SESSION_ID}; the frontend
// passes it to "confirm", which retrieves the session server-side with
// the secret key and — only if Stripe says it's paid — applies the plan
// or credits. "sync" reconciles subscription status (renewal lapses,
// portal cancellations) from Stripe on demand, e.g. on billing-page
// load. billing_events doubles as the idempotency ledger so a re-sent
// session_id can never double-grant.
//
// Secrets (supabase secrets set …):
//   STRIPE_SECRET_KEY          — restricted key; needs write on Checkout
//                                Sessions, Customers, Billing Portal,
//                                read on Subscriptions
//   STRIPE_PRICE_PRO           — the Pro monthly subscription price id
//   STRIPE_PRICE_TOPUP_SMALL / STRIPE_PRICE_TOPUP_LARGE
//                              — one-time credit-pack price ids
//   APP_ORIGIN                 — e.g. https://app.example.com (redirects)
//
// Deploy: supabase functions deploy stripe-checkout

import Stripe from "npm:stripe@17";
import { getAdminClient, requireUser, checkRate, creditsBucketFor, getPlan } from "../_shared/limits.ts";
import { featuresForPlan } from "../_shared/plans.ts";

// Keep in sync with the frontend billing page's pack labels.
const TOPUP_PACKS: Record<string, { priceEnv: string; credits: number }> = {
  small: { priceEnv: "STRIPE_PRICE_TOPUP_SMALL", credits: 250 },
  large: { priceEnv: "STRIPE_PRICE_TOPUP_LARGE", credits: 1000 },
};

// Granting credits lowers recorded usage, so the "limit" arg never
// binds — pass something huge (same stance as admin-clients).
const GRANT_LIMIT = 1_000_000_000;

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

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY secret is not set" }, 500);

  // Where Stripe sends the customer back. Prefer the request's own
  // Origin when it passes the same allowlist CORS uses — that makes
  // redirects follow whatever host the app is actually served from
  // (prod, preview, localhost) with the APP_ORIGIN secret as fallback.
  const reqOrigin = req.headers.get("origin") || "";
  const originOk = reqOrigin && (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(reqOrigin));
  const appOrigin = ((originOk ? reqOrigin : "") || Deno.env.get("APP_ORIGIN") || "").replace(/\/$/, "");
  // Only the redirect-producing actions need it — checked inside each.

  const admin = getAdminClient();
  const user = await requireUser(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);

  const rate = await checkRate(admin, user.id, "stripe-checkout", 10, 300);
  if (!rate.ok) return json(rate.body, rate.status);

  let body: { action?: string; plan?: string; pack?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Find-or-create this account's Stripe customer, remembering it so
  // portal/subscription events can be traced back to the user later.
  async function getCustomerId(): Promise<string> {
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (profile?.stripe_customer_id) return profile.stripe_customer_id;

    const customer = await stripe.customers.create({
      email: user!.email ?? undefined,
      metadata: { user_id: user!.id },
    });
    // Upsert, not update: a user whose profile row doesn't exist yet
    // (signed up outside the normal provision flow) would silently
    // no-op an update, minting a fresh Stripe customer every checkout
    // and leaving sync unable to find their subscription.
    await admin
      .from("profiles")
      .upsert({ user_id: user!.id, stripe_customer_id: customer.id }, { onConflict: "user_id" });
    return customer.id;
  }

  try {
    if (body.action === "subscribe") {
      if (!appOrigin) return json({ error: "no_redirect_origin" }, 500);
      // Single-plan model: the only subscription is Pro. The free week
      // already happened in-app (profiles.trial_ends_at), so there is
      // no Stripe-side trial — paying starts the moment they upgrade.
      const price = Deno.env.get("STRIPE_PRICE_PRO");
      if (!price) return json({ error: "STRIPE_PRICE_PRO secret is not set" }, 500);

      const customer = await getCustomerId();
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: user.id,
        line_items: [{ price, quantity: 1 }],
        subscription_data: {
          metadata: { user_id: user.id, plan: "pro" },
        },
        metadata: { kind: "subscribe", user_id: user.id, plan: "pro" },
        success_url: `${appOrigin}/app/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appOrigin}/app/billing?status=cancelled`,
      });
      return json({ url: session.url }, 200);
    }

    if (body.action === "topup") {
      if (!appOrigin) return json({ error: "no_redirect_origin" }, 500);
      const pack = TOPUP_PACKS[String(body.pack || "")];
      if (!pack) return json({ error: "invalid_pack" }, 400);
      const price = Deno.env.get(pack.priceEnv);
      if (!price) return json({ error: `${pack.priceEnv} secret is not set` }, 500);

      const customer = await getCustomerId();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer,
        client_reference_id: user.id,
        line_items: [{ price, quantity: 1 }],
        metadata: { kind: "topup", user_id: user.id, credits: String(pack.credits) },
        success_url: `${appOrigin}/app/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appOrigin}/app/billing?status=cancelled`,
      });
      return json({ url: session.url }, 200);
    }

    if (body.action === "portal") {
      if (!appOrigin) return json({ error: "no_redirect_origin" }, 500);
      const customer = await getCustomerId();
      const session = await stripe.billingPortal.sessions.create({
        customer,
        return_url: `${appOrigin}/app/billing`,
      });
      return json({ url: session.url }, 200);
    }

    if (body.action === "confirm") {
      // The customer is back from Stripe with a session_id. Trust
      // nothing from the client except the id itself — ownership,
      // payment state, and what was bought all come from Stripe.
      const sessionId = String((body as { session_id?: string }).session_id || "");
      if (!/^cs_/.test(sessionId)) return json({ error: "invalid_session_id" }, 400);

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const sessionUser = session.client_reference_id ?? session.metadata?.user_id ?? null;
      if (sessionUser !== user.id) return json({ error: "session_user_mismatch" }, 403);

      const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
      if (session.status !== "complete" || !paid) {
        return json({ ok: false, status: session.status, payment_status: session.payment_status }, 200);
      }

      // Claim the session id before granting anything — a re-confirm
      // (refresh, back button, replayed request) hits the unique
      // constraint and is acked without granting twice.
      const { error: claimErr } = await admin
        .from("billing_events")
        .insert({ stripe_event_id: session.id, type: "checkout.confirm" });
      if (claimErr) {
        if (claimErr.code === "23505") return json({ ok: true, duplicate: true }, 200);
        return json({ error: "claim_failed", detail: claimErr.message }, 500);
      }

      if (session.metadata?.kind === "topup") {
        const credits = Math.trunc(Number(session.metadata?.credits));
        if (Number.isFinite(credits) && credits > 0) {
          // Granting credits lowers the recorded usage in this user's
          // active bucket, so the allowance-minus-usage math picks it up.
          const plan = await getPlan(admin, user.id);
          await admin.rpc("increment_usage", {
            p_user_id: user.id,
            p_bucket: creditsBucketFor(plan),
            p_limit: GRANT_LIMIT,
            p_amount: -credits,
          });
        }
        return json({ ok: true, kind: "topup" }, 200);
      }

      if (session.mode === "subscription") {
        // Also persist the customer id here — belt and braces for any
        // profile that missed it at session-creation time, so sync can
        // always trace this user back to their subscription.
        const row: Record<string, unknown> = { user_id: user.id, plan: "pro", features: featuresForPlan("pro") };
        if (typeof session.customer === "string") row.stripe_customer_id = session.customer;
        await admin.from("profiles").upsert(row, { onConflict: "user_id" });
        return json({ ok: true, kind: "subscribe", plan: "pro" }, 200);
      }

      return json({ ok: true, kind: "unknown" }, 200);
    }

    if (body.action === "sync") {
      // Webhook-free reconciliation: ask Stripe what this customer's
      // subscription actually looks like right now and mirror it. The
      // frontend calls this on billing-page load and after portal
      // visits, so cancellations/lapses are picked up the next time
      // the user shows up.
      const { data: profile } = await admin
        .from("profiles")
        .select("stripe_customer_id, plan")
        .eq("user_id", user.id)
        .maybeSingle();
      // No Stripe customer to check against — report the plan we have
      // rather than hardcoding "trial", so a pro profile missing its
      // customer id is never *displayed* as downgraded.
      if (!profile?.stripe_customer_id) {
        return json({ ok: true, plan: profile?.plan === "pro" ? "pro" : "trial", synced: false }, 200);
      }

      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "all",
        limit: 10,
      });
      const hasLive = subs.data.some((s) => s.status === "active" || s.status === "trialing");
      const plan = hasLive ? "pro" : "trial";

      if (plan !== profile.plan) {
        // Downgrade path deliberately leaves trial_ends_at alone — for
        // anyone past their free week that's an already-expired trial,
        // i.e. AI features lock until they re-subscribe.
        await admin
          .from("profiles")
          .upsert({ user_id: user.id, plan, features: featuresForPlan(plan) }, { onConflict: "user_id" });
      }
      return json({ ok: true, plan, synced: true }, 200);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return json({ error: "stripe_error", detail: detail.slice(0, 500) }, 502);
  }
});

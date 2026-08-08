// stripe-webhook — Supabase Edge Function
// CURRENTLY UNUSED: the live flow is webhook-free — stripe-checkout's
// "confirm"/"sync" actions pull payment state from Stripe directly.
// Kept as an optional backstop; only live if an endpoint is registered
// in the Stripe dashboard and STRIPE_WEBHOOK_SECRET is set.
// Stripe calls this directly (verify_jwt = false — Stripe has no
// Supabase JWT); authenticity comes from the webhook signature over the
// RAW request body, so the body must be read with req.text() before any
// JSON parsing.
//
// Handled events:
//   checkout.session.completed        — top-up: grant credits
//                                       subscribe: set plan to pro
//   customer.subscription.updated     — pro re-confirmed from the portal
//   customer.subscription.deleted     — back to (expired) trial
//
// Idempotency: Stripe retries deliveries. Every event id is inserted
// into billing_events first; a unique-violation means it was already
// processed — ack with 200 and do nothing.
//
// Secrets: STRIPE_WEBHOOK_SECRET (whsec_… from the dashboard endpoint).
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt

import Stripe from "npm:stripe@17";
import { getAdminClient, creditsBucketFor, getPlan } from "../_shared/limits.ts";
import { featuresForPlan } from "../_shared/plans.ts";

// Mirrors admin-clients' ADMIN_ADJUST_LIMIT stance: the "limit" arg is
// meaningless for a grant (count goes DOWN), so pass something huge.
const GRANT_LIMIT = 1_000_000_000;

// Single-plan model: the only paid plan a webhook can set.
const VALID_PLANS = ["pro"];

Deno.serve(async (req) => {
  function json(payload: unknown, status: number): Response {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) return json({ error: "STRIPE_WEBHOOK_SECRET secret is not set" }, 500);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing_signature" }, 400);

  // RAW body — parsing before verification would break the signature.
  const rawBody = await req.text();

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "sk_unused_for_verification", {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    return json({ error: "invalid_signature", detail: err instanceof Error ? err.message : "" }, 400);
  }

  const admin = getAdminClient();

  // Claim the event id before doing any work — a duplicate delivery
  // hits the unique constraint and gets acked without re-processing.
  const { error: claimErr } = await admin
    .from("billing_events")
    .insert({ stripe_event_id: event.id, type: event.type });
  if (claimErr) {
    if (claimErr.code === "23505") return json({ ok: true, duplicate: true }, 200);
    return json({ error: "claim_failed", detail: claimErr.message }, 500);
  }

  async function resolveUserId(customerId: string | null, explicit?: string | null): Promise<string | null> {
    if (explicit) return explicit;
    if (!customerId) return null;
    const { data } = await admin
      .from("profiles")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return data?.user_id ?? null;
  }

  async function setPlan(userId: string, plan: string): Promise<void> {
    await admin
      .from("profiles")
      .upsert({ user_id: userId, plan, features: featuresForPlan(plan) }, { onConflict: "user_id" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = await resolveUserId(
        typeof session.customer === "string" ? session.customer : null,
        session.client_reference_id ?? session.metadata?.user_id
      );
      if (!userId) return json({ ok: true, skipped: "no_user" }, 200);

      if (session.metadata?.kind === "topup") {
        const credits = Math.trunc(Number(session.metadata?.credits));
        if (Number.isFinite(credits) && credits > 0) {
          // Same mechanic as admin-clients' adjustCredits: granting
          // credits lowers the recorded usage in this user's active
          // bucket (monthly for pro, the lifetime trial pot otherwise),
          // so the normal allowance-minus-usage math picks it up.
          const plan = await getPlan(admin, userId);
          await admin.rpc("increment_usage", {
            p_user_id: userId,
            p_bucket: creditsBucketFor(plan),
            p_limit: GRANT_LIMIT,
            p_amount: -credits,
          });
        }
      } else if (session.mode === "subscription") {
        const plan = String(session.metadata?.plan || "");
        if (VALID_PLANS.includes(plan)) await setPlan(userId, plan);
      }
      return json({ ok: true }, 200);
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      // Only act on states where access should exist — payment failures
      // and cancellations resolve through subscription.deleted.
      if (sub.status !== "active" && sub.status !== "trialing") return json({ ok: true }, 200);
      const userId = await resolveUserId(
        typeof sub.customer === "string" ? sub.customer : null,
        sub.metadata?.user_id
      );
      const plan = String(sub.metadata?.plan || "");
      if (userId && VALID_PLANS.includes(plan)) await setPlan(userId, plan);
      return json({ ok: true }, 200);
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId(
        typeof sub.customer === "string" ? sub.customer : null,
        sub.metadata?.user_id
      );
      // Back to 'trial' WITHOUT touching trial_ends_at — for anyone who
      // cancels after their free week, that's an already-expired trial,
      // i.e. AI features lock again until they re-subscribe.
      if (userId) await setPlan(userId, "trial");
      return json({ ok: true }, 200);
    }

    // Unhandled event types are acked so Stripe stops retrying them.
    return json({ ok: true, unhandled: event.type }, 200);
  } catch (err) {
    return json({ error: "handler_failed", detail: err instanceof Error ? err.message : "" }, 500);
  }
});

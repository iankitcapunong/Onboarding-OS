-- BSL 2.0 — real Stripe billing scaffolding.
--
-- profiles.stripe_customer_id links an account to its Stripe customer
-- (created lazily by the stripe-checkout Edge Function). Readable by
-- the owner under the existing "profiles: self select" policy — it's
-- an opaque id, not a secret.
alter table public.profiles
  add column if not exists stripe_customer_id text unique;

-- Webhook idempotency ledger: Stripe retries deliveries, and a replayed
-- checkout.session.completed must not double-grant credits. Insert the
-- event id first; a unique-violation means "already processed, ack it".
-- No client policies — only the stripe-webhook function (service_role)
-- ever touches this.
create table if not exists public.billing_events (
  id bigint generated always as identity primary key,
  stripe_event_id text not null unique,
  type text not null,
  created_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;
-- Deliberately no policies (same stance as usage_counters).

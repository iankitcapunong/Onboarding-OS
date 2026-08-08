-- BSL 2.0 — single-plan billing.
--
-- The tiered starter/growth/full plans are gone. Every account now
-- starts on a 7-day free trial with a one-time pot of 3000 credits
-- (no card required), and the only paid plan is 'pro'. When the trial
-- clock or the trial credits run out, Edge Functions refuse AI work
-- (402 trial_expired / out_of_credits) until Stripe confirms a Pro
-- subscription via stripe-webhook.

-- When the trial actually ends, per account. Backfills existing rows
-- with a fresh 7-day runway from the moment this migration runs —
-- legacy tiered accounts are grandfathered into a new trial rather
-- than locked out cold.
alter table public.profiles
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '7 days');

alter table public.profiles alter column plan set default 'trial';

-- Collapse the legacy tiers into the trial.
update public.profiles set plan = 'trial' where plan not in ('trial', 'pro');

-- Self-inserts used to be pinned to 'starter' so nobody could grant
-- themselves a richer allowance from devtools; same stance, new default.
drop policy if exists "profiles: self insert at default plan only" on public.profiles;
create policy "profiles: self insert at default plan only"
  on public.profiles for insert
  with check (auth.uid() = user_id and plan = 'trial');

-- The app now reads the REAL credit ledger instead of mirroring spends
-- in localStorage: let a signed-in user read (only) their own counters.
-- Writes stay service_role-only — no insert/update/delete policies.
drop policy if exists "usage_counters: self select" on public.usage_counters;
create policy "usage_counters: self select"
  on public.usage_counters for select
  using (auth.uid() = user_id);

-- Realtime: stream plan/trial changes (profiles) and credit spends
-- (usage_counters) to the owner, so the app's balance and the
-- post-payment Pro unlock update live without polling. RLS above is
-- what scopes the stream to the owner's own rows.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.usage_counters;
exception when duplicate_object then null;
end $$;

-- BSL 2.0 — server-side source of truth for plan + usage.
--
-- Everything about "what plan is this account on" and "how much have
-- they used" lived only in browser localStorage before this migration —
-- fully spoofable from devtools. This gives Edge Functions a real place
-- to check and record usage, using the service_role key (never exposed
-- to the browser) so RLS can stay locked down to read-only for users.

-- ============================================================
-- profiles — one row per auth user, holds the plan Edge Functions
-- trust for credit allowances. Insertable by the user themselves
-- (self-signup, always at the default plan); only service_role can
-- change plan afterwards (e.g. a future billing webhook), so a user
-- can't grant themselves a richer plan from devtools.
-- ============================================================
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'starter',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: self select"
  on public.profiles for select
  using (auth.uid() = user_id);

-- The plan column isn't RLS-restricted by row ownership alone — without
-- pinning it to the default here, a signed-in user could self-insert
-- {user_id: <self>, plan: 'full'} and grant themselves the richest
-- allowance. Every self-insert is forced to 'starter'; any real upgrade
-- has to come from service_role (an admin action today, a billing
-- webhook once Stripe is wired up).
create policy "profiles: self insert at default plan only"
  on public.profiles for insert
  with check (auth.uid() = user_id and plan = 'starter');

-- No update/delete policies for the authenticated role — plan changes
-- are only ever made by Edge Functions using the service_role key,
-- which bypasses RLS entirely.

-- ============================================================
-- usage_counters — generic fixed-window counter. One row per
-- (user_id, bucket); "bucket" encodes both the window and what's being
-- counted, e.g. "credits:2026-07" (monthly credit ledger) or
-- "rate:brible:2026-07-22T14:05" (per-minute rate-limit window).
-- No client policies at all — only service_role (Edge Functions) ever
-- reads or writes this table.
-- ============================================================
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

alter table public.usage_counters enable row level security;
-- Deliberately no policies: RLS on with zero policies denies all access
-- to the authenticated/anon roles; service_role bypasses RLS by design.

-- ============================================================
-- increment_usage — atomically bump a counter and report whether the
-- new value is still within limit. Used for both rate limiting (small
-- window, small limit) and monthly credits (month-long window, plan's
-- allowance) so Edge Functions share one primitive.
-- security definer + fixed search_path so it can only be called with
-- the privileges it needs, regardless of caller.
-- ============================================================
create or replace function public.increment_usage(
  p_user_id uuid,
  p_bucket text,
  p_limit integer
) returns table(new_count integer, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into usage_counters (user_id, bucket, count, updated_at)
  values (p_user_id, p_bucket, 1, now())
  on conflict (user_id, bucket)
  do update set count = usage_counters.count + 1, updated_at = now()
  returning usage_counters.count into new_count;

  allowed := new_count <= p_limit;
  return next;
end;
$$;

-- Only service_role should ever call this (Edge Functions use the
-- service_role client) — revoke from the client-facing roles.
revoke all on function public.increment_usage(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.increment_usage(uuid, text, integer) to service_role;

-- BSL 2.0 — multi-assistant publish fix, native integrations, tier caps.
--
-- Four things, all in service of "collected data reaches the client's
-- CRM":
--   1. Drop the transitional one-deployment-per-account unique index
--      that 0006 left behind. The /app/assistants UI it was waiting on
--      shipped, and its upsert conflicts on assistant_id — publishing a
--      SECOND assistant currently fails with a 23505.
--   2. Widen assistant_tools beyond 'webhook' to the native destination
--      types agent-talk can now dispatch to (zapier / ghl / sheets),
--      and snapshot first_message onto deployments so the public /talk
--      page can greet with it.
--   3. agent_sessions.extracted — the structured {contact, answers,
--      summary} the end-of-session LLM extraction produces; what the
--      CRM push is actually made of. Plus integration_deliveries, the
--      per-attempt delivery log the Integrations tab shows so a client
--      can CONFIRM their data landed (and see why when it didn't).
--   4. Server-enforced per-tier creation caps. assistants and
--      assistant_tools are inserted straight from the browser under
--      RLS, so a client-side check alone is decoration — these triggers
--      are the real limit. Plan caps mirror
--      supabase/functions/_shared/plans.ts's PLAN_ASSISTANT_LIMITS and
--      src/lib/featureGating.ts's ASSISTANT_LIMITS — kept in sync BY
--      HAND like every other cross-repo constant (see _shared/limits.ts).

-- ============================================================
-- 1. Multi-assistant publishing
-- ============================================================

drop index if exists public.agent_deployments_user_uidx;

-- The deployment is a snapshot (persona/prompt/voice already are) — the
-- greeting must not change under a published link until re-publish.
alter table public.agent_deployments
  add column if not exists first_message text not null default '';

update public.agent_deployments d
set first_message = a.first_message
from public.assistants a
where a.id = d.assistant_id and d.first_message = '';

-- ============================================================
-- 2. Destination types
-- ============================================================

-- config shapes by type (all owner-readable under RLS, same accepted
-- trade-off as the webhook secret — it's the owner's own credential
-- for their own destination):
--   webhook: { "url", "secret", "events": ["session.ended"] }
--   zapier:  { "url" }                       -- a Zap's catch-hook URL
--   ghl:     { "token", "locationId",        -- Private Integration token
--              "pipelineId"?, "stageId"?, "tags"?: ["…"] }
--   sheets:  { "spreadsheetId", "sheetName"? }
alter table public.assistant_tools
  drop constraint if exists assistant_tools_type_check;
alter table public.assistant_tools
  add constraint assistant_tools_type_check
  check (type in ('webhook', 'zapier', 'ghl', 'sheets'));

-- ============================================================
-- 3. Extraction + delivery log
-- ============================================================

-- { "contact": {name,email,phone,company}, "answers": {…}, "summary" }
-- Written by agent-talk's service_role client at session end; owner
-- reads it through the existing "agent_sessions: owner select" policy.
alter table public.agent_sessions
  add column if not exists extracted jsonb;
alter table public.agent_sessions
  add column if not exists extracted_at timestamptz;

create table if not exists public.integration_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id uuid references public.assistant_tools(id) on delete set null,
  -- Null for test sends (integration-test) — those have no session.
  session_id uuid references public.agent_sessions(id) on delete set null,
  -- Denormalized so a delivery row stays legible after its tool is
  -- deleted (tool_id goes null but "ghl · Main CRM" still reads).
  type text not null,
  tool_name text not null default '',
  event text not null default 'session.ended',
  ok boolean not null,
  status_code integer,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists integration_deliveries_owner_idx
  on public.integration_deliveries(user_id, created_at desc);

alter table public.integration_deliveries enable row level security;

create policy "integration_deliveries: owner select"
  on public.integration_deliveries for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies — service_role only, same stance as
-- agent_sessions/agent_messages.

-- ============================================================
-- 4. Tier caps
-- ============================================================

-- Admin accounts are unmetered everywhere else; mirror of
-- _shared/admin.ts's ADMIN_EMAILS (hand-synced, same trade-off).
create or replace function public.is_admin_user(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users
    where id = p_user_id
      and lower(email) in ('bryansumait.contact@gmail.com')
  );
$$;

create or replace function public.enforce_assistant_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_count integer;
  v_limit integer;
begin
  if public.is_admin_user(new.user_id) then
    return new;
  end if;
  select plan into v_plan from public.profiles where user_id = new.user_id;
  -- Anything that isn't a Stripe-confirmed 'pro' reads as trial — same
  -- normalizePlan rule as _shared/limits.ts.
  if v_plan = 'pro' then v_limit := 10; else v_limit := 2; end if;
  select count(*) into v_count from public.assistants where user_id = new.user_id;
  if v_count >= v_limit then
    -- The exact token 'assistant_limit_reached' is matched client-side
    -- (src/app/app/assistants/page.tsx) for the friendly upgrade toast.
    raise exception 'assistant_limit_reached: your plan allows up to % assistants', v_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists assistants_enforce_limit on public.assistants;
create trigger assistants_enforce_limit
  before insert on public.assistants
  for each row execute function public.enforce_assistant_limit();

-- Destinations are cheap rows but browser-insertable — bound them so a
-- scripted client can't grow the table (and the per-session dispatch
-- fan-out) without limit. Generous flat cap, not a tier lever.
create or replace function public.enforce_tool_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if public.is_admin_user(new.user_id) then
    return new;
  end if;
  select count(*) into v_count from public.assistant_tools where user_id = new.user_id;
  if v_count >= 20 then
    raise exception 'tool_limit_reached: up to 20 destinations per account';
  end if;
  return new;
end;
$$;

drop trigger if exists assistant_tools_enforce_limit on public.assistant_tools;
create trigger assistant_tools_enforce_limit
  before insert on public.assistant_tools
  for each row execute function public.enforce_tool_limit();

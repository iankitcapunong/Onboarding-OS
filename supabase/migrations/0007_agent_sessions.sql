-- BSL 2.0 — durable transcripts for the public /talk/<slug> chat.
--
-- Until now a /talk conversation lived only in the visitor's React
-- state — refresh and it was gone, and the deploying account had no way
-- to see what its onboarding agent actually said. These two tables back
-- the new /app/logs tab.
--
-- The session id is GENERATED CLIENT-SIDE by the anonymous /talk page
-- (crypto.randomUUID) and validated by agent-talk: uuid format, and an
-- existing session must belong to the same deployment as the slug being
-- messaged — otherwise a forged id could pollute another tenant's logs.
--
-- Writes happen ONLY via agent-talk's service_role client, best-effort
-- (a logging failure never fails the chat reply). Owners get read-only
-- SELECT via RLS, mirroring usage_counters' service-role-writes stance.
create table if not exists public.agent_sessions (
  id uuid primary key,
  deployment_id uuid not null references public.agent_deployments(id) on delete cascade,
  -- Denormalized owner so RLS is one indexed equality, not a join
  -- through agent_deployments on every Logs query.
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  message_count integer not null default 0,
  ended_at timestamptz
);

create index if not exists agent_sessions_owner_idx
  on public.agent_sessions(user_id, started_at desc);
create index if not exists agent_sessions_deployment_idx
  on public.agent_sessions(deployment_id);

alter table public.agent_sessions enable row level security;

create policy "agent_sessions: owner select"
  on public.agent_sessions for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies — service_role only.

create table if not exists public.agent_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_session_idx
  on public.agent_messages(session_id, id);

alter table public.agent_messages enable row level security;

-- Owner-select via the parent session (subquery, not a join — RLS
-- policies can't join, and the session lookup is a PK hit).
create policy "agent_messages: owner select"
  on public.agent_messages for select
  using (
    exists (
      select 1 from public.agent_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

-- No insert/update/delete policies — service_role only.

-- Retention is deliberately not scheduled here: pg_cron availability on
-- this project is unverified. When confirmed, add
--   select cron.schedule('purge-agent-sessions', '17 3 * * *',
--     $$delete from public.agent_sessions
--       where last_message_at < now() - interval '90 days'$$);
-- (messages cascade). Until then the tables just grow — acceptable at
-- current traffic.

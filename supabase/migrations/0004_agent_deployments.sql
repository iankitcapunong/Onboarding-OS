-- BSL 2.0 — deployable onboarding agent links.
--
-- The Playground only ever wrote to the browser's localStorage, so
-- there was no server-side record a client-facing onboarding link
-- could point at. This gives each account a durable
-- (user_id, slug, persona, prompt, voice) row: the Deploy tab reads/
-- writes it directly (self-serve, no Edge Function needed — same trust
-- level localStorage already had, just durable), and the public
-- /talk/<slug> page + agent-talk Edge Function read it via the
-- service_role key to actually run the conversation.
--
-- One row per user (primary key is user_id, not a separate id) because
-- the product only supports one deployed onboarding agent per account
-- right now — see the Playground scope-cut that removed the other
-- agent types; multiple deployments per account is future add-on
-- scope, not today's.
create table if not exists public.agent_deployments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique,
  persona text not null,
  prompt text not null,
  voice text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.agent_deployments enable row level security;

create policy "agent_deployments: self select"
  on public.agent_deployments for select
  using (auth.uid() = user_id);

create policy "agent_deployments: self insert"
  on public.agent_deployments for insert
  with check (auth.uid() = user_id);

create policy "agent_deployments: self update"
  on public.agent_deployments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No self-delete policy — deployments aren't torn down by clients today
-- (mirrors profiles' no-delete stance); nothing in the product needs it
-- yet.
--
-- No select policy for anon or for any row but your own: the public
-- /talk/<slug> page never queries this table directly from the browser
-- — it goes through the agent-talk Edge Function, which uses the
-- service_role key and bypasses RLS entirely, so an anonymous visitor
-- never sees the owner's user_id or any row but the one their slug
-- resolves to.

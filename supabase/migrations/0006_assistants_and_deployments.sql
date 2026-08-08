-- BSL 2.0 — multi-assistant builder ("Composer"), replacing the single
-- hardcoded Playground agent.
--
-- assistants = the editable DRAFT an account works on in /app/assistants.
-- agent_deployments = the PUBLISHED snapshot the public /talk/<slug> page
-- serves. Publish copies the assistant's fields into its deployment row,
-- so a live link never changes out from under a visitor mid-edit, and
-- the agent-talk Edge Function keeps its exact contract.
create table if not exists public.assistants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled assistant',
  first_message text not null default '',
  persona text not null default '',
  prompt text not null default '',
  voice text not null default '',
  -- Blank = the server default in agent-talk; a per-assistant override
  -- is future scope but cheap to carry now.
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistants_user_idx on public.assistants(user_id);

alter table public.assistants enable row level security;

create policy "assistants: self select"
  on public.assistants for select
  using (auth.uid() = user_id);

create policy "assistants: self insert"
  on public.assistants for insert
  with check (auth.uid() = user_id);

create policy "assistants: self update"
  on public.assistants for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Unlike agent_deployments' original no-delete stance, drafts are cheap
-- and user-owned — deleting one cascades its deployment (and with it the
-- public link), which is exactly what "delete this assistant" means.
create policy "assistants: self delete"
  on public.assistants for delete
  using (auth.uid() = user_id);

-- ============================================================
-- agent_deployments: one-per-account -> one-per-assistant.
-- The PK moves from user_id to a surrogate id; every existing
-- deployment becomes the account's first assistant so live
-- /talk/<slug> links keep answering unchanged.
-- ============================================================
alter table public.agent_deployments
  add column if not exists id uuid not null default gen_random_uuid();
alter table public.agent_deployments
  add column if not exists assistant_id uuid references public.assistants(id) on delete cascade;

-- Backfill: one assistant per existing deployment, then link them.
-- (No existing assistants can collide — the table was just created.)
with created as (
  insert into public.assistants (user_id, name, persona, prompt, voice)
  select user_id, 'Onboarding agent', persona, prompt, voice
  from public.agent_deployments
  returning id, user_id
)
update public.agent_deployments d
set assistant_id = c.id
from created c
where c.user_id = d.user_id;

alter table public.agent_deployments drop constraint agent_deployments_pkey;
alter table public.agent_deployments add primary key (id);
alter table public.agent_deployments alter column assistant_id set not null;

create unique index if not exists agent_deployments_assistant_uidx
  on public.agent_deployments(assistant_id);

-- TRANSITIONAL: the currently-deployed Deploy page still upserts with
-- onConflict:"user_id", which needs a unique index to resolve. Keep one
-- until the new /app/assistants UI ships, then drop it in a follow-up
-- migration (multi-assistant per account is blocked until that lands).
create unique index if not exists agent_deployments_user_uidx
  on public.agent_deployments(user_id);

-- slug keeps its original UNIQUE constraint — public links are stable.

-- Deleting an assistant must also be able to tear down its deployment
-- row under RLS (the cascade runs as the deleting user).
create policy "agent_deployments: self delete"
  on public.agent_deployments for delete
  using (auth.uid() = user_id);

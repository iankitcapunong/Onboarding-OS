-- BSL 2.0 — client-configurable tools for the onboarding agent.
--
-- v1 ships exactly one tool type: an outbound webhook fired by
-- agent-talk when a /talk session ends, carrying the transcript. That's
-- the smallest genuinely-useful "integrate your own stuff" — clients
-- can point it at Zapier/n8n/their own endpoint today; richer native
-- integrations (Sheets, CRM) are future scope.
--
-- config shape for type='webhook':
--   { "url": "https://...", "secret": "<hmac key>", "events": ["session.ended"] }
-- The secret signs the payload (X-BSL-Signature, hmac-sha256) so the
-- receiver can verify origin. It's readable by its owner under RLS —
-- that's fine, it's the owner's own secret for their own endpoint.
create table if not exists public.assistant_tools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Null = account-wide (fires for every assistant this account owns).
  assistant_id uuid references public.assistants(id) on delete cascade,
  type text not null check (type in ('webhook')),
  name text not null default 'Webhook',
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_tools_user_idx on public.assistant_tools(user_id);
create index if not exists assistant_tools_assistant_idx on public.assistant_tools(assistant_id);

alter table public.assistant_tools enable row level security;

create policy "assistant_tools: self select"
  on public.assistant_tools for select
  using (auth.uid() = user_id);

create policy "assistant_tools: self insert"
  on public.assistant_tools for insert
  with check (auth.uid() = user_id);

create policy "assistant_tools: self update"
  on public.assistant_tools for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "assistant_tools: self delete"
  on public.assistant_tools for delete
  using (auth.uid() = user_id);

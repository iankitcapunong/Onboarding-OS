-- BSL 2.0 — schema support for two pre-launch audit fixes.
--
-- 1. leads.ip_hash — lead-capture's throttle counted every row created in
--    the trailing window, across all visitors, and 429'd once it hit the
--    limit. That is a denial of service with a two-line script: submit
--    enough addresses and genuine leads stop being captured, silently,
--    for everyone. Keying the window to the submitter needs somewhere to
--    put the key. We store a salted SHA-256 of the client IP, never the
--    address itself, so the throttle works without the leads table
--    becoming a log of who visited the landing page.
--
-- 2. agent_deployments length caps — persona/prompt/voice/first_message
--    are inserted straight from the browser under RLS and had no ceiling
--    anywhere: not in the column type, not in the editor, not in
--    agent-talk. Since every /talk turn feeds them to the model and bills
--    a flat 10 credits regardless of size, a tenant could publish a
--    context-window-sized persona and drive real spend against our own
--    API key inside their own credit allowance. The database is the
--    enforceable place precisely because publishing is a direct insert.
--
--    Added NOT VALID: the constraint applies to every insert and update
--    from here on, but the migration does not fail on pre-existing rows.

alter table public.leads
  add column if not exists ip_hash text;

-- Supports the per-submitter window count in lead-capture.
create index if not exists leads_ip_hash_created_idx
  on public.leads (ip_hash, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agent_deployments_prompt_size'
  ) then
    alter table public.agent_deployments
      add constraint agent_deployments_prompt_size check (
        coalesce(length(persona), 0) <= 4000
        and coalesce(length(prompt), 0) <= 12000
        and coalesce(length(voice), 0) <= 2000
        and coalesce(length(first_message), 0) <= 2000
      ) not valid;
  end if;
end;
$$;

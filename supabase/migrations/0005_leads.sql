-- BSL 2.0 — real storage for marketing-page lead capture.
--
-- The VSL lead modal on the landing page only ever wrote the visitor's
-- name/email to that browser's localStorage — the "submit" was
-- simulated, so every captured lead was silently lost. This gives the
-- lead-capture Edge Function a durable place to put them.
--
-- One row per email (unique, stored lowercased by the function): a
-- visitor re-submitting just refreshes their name/source instead of
-- duplicating. No client policies at all — the anonymous marketing page
-- goes through the lead-capture Edge Function (service_role), and
-- there's no in-app UI reading leads yet; when one is added it should
-- read through an admin Edge Function like admin-clients does.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  source text not null default 'video',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;
-- Deliberately no policies: RLS on with zero policies denies all access
-- to the authenticated/anon roles; service_role bypasses RLS by design
-- (same stance as usage_counters).

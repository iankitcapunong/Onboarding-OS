-- BSL 2.0 — fix increment_usage() to actually record the credit cost.
--
-- increment_usage() has always bumped the stored counter by exactly 1
-- per call. That's correct for rate limiting (1 request = 1 tick), but
-- checkAndSpendCredits() in supabase/functions/_shared/limits.ts also
-- calls it once per spend to record `cost` credits (5-50 depending on
-- the feature) — so the credits:<month> bucket has only ever been
-- counting *actions*, not *credits spent*, drastically undercounting
-- real usage and letting the "remaining" total balloon back up after
-- enough real spends. Rate-limit callers keep passing no amount (the
-- new p_amount defaults to 1, so their behavior is unchanged);
-- checkAndSpendCredits is updated separately to pass p_amount := cost.

drop function if exists public.increment_usage(uuid, text, integer);

create or replace function public.increment_usage(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_amount integer default 1
) returns table(new_count integer, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into usage_counters (user_id, bucket, count, updated_at)
  values (p_user_id, p_bucket, p_amount, now())
  on conflict (user_id, bucket)
  do update set count = usage_counters.count + p_amount, updated_at = now()
  returning usage_counters.count into new_count;

  allowed := new_count <= p_limit;
  return next;
end;
$$;

revoke all on function public.increment_usage(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.increment_usage(uuid, text, integer, integer) to service_role;

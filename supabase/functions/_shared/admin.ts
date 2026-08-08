// BSL 2.0 — server-side mirror of src/lib/featureGating.ts's
// ADMIN_EMAILS. Client-side ADMIN_EMAILS only gates the UI (which nav
// items/pages render); this is the copy Edge Functions actually trust
// to authorize admin-only actions, since a client-supplied "am I
// admin" flag can't be trusted. There is no shared source between the
// two repos — keep both lists in sync by hand, the same accepted
// tradeoff already in place for PLAN_CREDITS/CREDIT_COSTS (see
// supabase/functions/_shared/limits.ts and supabase/functions/credits/
// index.ts's header comments). Granting/revoking admin requires
// updating BOTH this file and src/lib/featureGating.ts's ADMIN_EMAILS
// together, or the client UI and server authorization will drift.
export const ADMIN_EMAILS: string[] = ["bryansumait.contact@gmail.com"];

export function isAdminEmail(email: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

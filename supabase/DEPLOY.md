# Deploying

## Wave 3 — integrations, extraction, tier caps (August 2026)

Ships migration `0011_integrations_and_limits.sql`, the reworked
`agent-talk` (end-of-session extraction + multi-destination dispatch +
`init` action), the new `integration-test` function, and rate limits on
`admin-clients` / `provision-profile`.

```sh
supabase db push
supabase functions deploy agent-talk --no-verify-jwt
supabase functions deploy integration-test
supabase functions deploy admin-clients
supabase functions deploy provision-profile
```

Secrets — only needed for the native Google Sheets destination (GHL and
Zapier need nothing server-side; each client brings their own token/URL):

```sh
supabase secrets set GOOGLE_SA_EMAIL=<service account>@<project>.iam.gserviceaccount.com
supabase secrets set GOOGLE_SA_PRIVATE_KEY="<PKCS8 private key, \n-escaped>"
```

Create the service account in Google Cloud Console (no roles needed —
access comes from clients sharing their sheet with its email), enable
the Sheets API, and mint a JSON key. Optionally set
`NEXT_PUBLIC_SHEETS_SA_EMAIL` to the same email in the Next.js app's
env so the Integrations page can show clients exactly which address to
share their sheet with.

Verify:

- Publish TWO assistants on one account — both must go live (0011
  drops the transitional one-deployment-per-account index).
- On a trial (non-admin) account, create assistants until blocked — the
  third insert must fail with the friendly limit toast (DB trigger).
- Integrations tab → connect a destination → "Send test" — the result
  lands in Recent deliveries, and the destination actually received it
  (GHL contact + note, sheet row, Zap trigger, webhook POST).
- Run a real `/talk` conversation with a name + email, end it, and
  confirm: the session row has `extracted` populated, and the delivery
  log shows one row per enabled destination.

---

# Wave 1 — the security hardening changes

This covers everything needed to ship the rate limiting / usage quotas /
secret-proxying work: a new DB migration, one updated Edge Function, three
new Edge Functions, and the secrets they need. Run this from the repo
root with the [Supabase CLI](https://supabase.com/docs/guides/cli)
installed and logged in (`supabase login`).

## 0. Rotate the exposed keys first

Two keys were hardcoded in client JS and shipped to every visitor —
rotate both **before** deploying, since the old values are already public
(view-source, git history):

- **kie.ai workspace key** (was in `js/imagegen.js` / `js/videogen.js`) —
  generate a new key in the kie.ai dashboard and revoke the old one. The
  old value used to be written out here; it has been redacted (see below).
- **Google Sheets API key** (was in `js/app.js`) — generate a new key in
  Google Cloud Console and revoke the old one. Consider restricting the
  new key to the Sheets API only, and (if practical) to the two specific
  spreadsheet IDs.

> **Why the old values aren't printed here.** This document used to quote
> both keys in full so you could recognise which one to revoke. That made
> the repository itself a place the keys live, indefinitely, for anyone
> who ever gets a copy — and the note stayed long after the rotation it
> was written for. If you need to identify the old keys in a provider
> dashboard, match them by creation date or by the "last used" timestamp
> rather than by value. They remain in this file's git history; treat both
> as permanently compromised and confirm they are revoked at the provider.

## 1. Link the project (skip if already linked)

```
supabase link --project-ref xuqmlxjubpkntwvghgki
```

## 2. Apply the database migration

Creates `profiles` (server-side plan record) and `usage_counters` +
`increment_usage()` (the rate-limit/credit primitive). See
`supabase/migrations/0001_profiles_and_usage.sql` for what it does and
why.

```
supabase db push
```

## 3. Set secrets

```
supabase secrets set KIE_API_KEY=<new kie.ai key>
supabase secrets set ALLOWED_ORIGIN=https://<your production domain>
supabase secrets set AGENCY_CALL_LOG_SHEET_ID=<spreadsheet id>
supabase secrets set AGENCY_ONBOARDING_LOG_SHEET_ID=<spreadsheet id>
```

`GOOGLE_SHEETS_API_KEY` is **no longer used by anything** — `sheets-log`
reads through the service account now, so the key can be revoked without
affecting the app. An API key can only read a spreadsheet shared with
"anyone with the link", which meant the old code *required* those sheets
to be public. The service account reads a restricted sheet, so share each
agency sheet with `GOOGLE_SA_EMAIL` (Viewer) and set its Drive access to
Restricted.

The agency spreadsheet ids live in secrets rather than in the source
because this repository is public.

`ALLOWED_ORIGIN` locks down every function's CORS to your real domain
instead of `*`. Comma-separate multiple origins (e.g. production +
staging) if needed. `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`BRIBLE_PROVIDER`
should already be set from the original `brible` deploy — no change
needed there.

## 4. Deploy the functions

```
supabase functions deploy brible
supabase functions deploy imagegen
supabase functions deploy videogen
supabase functions deploy sheets-log
```

`supabase/config.toml` pins `verify_jwt = true` for all four, so
unauthenticated calls are rejected before they even reach the function
code.

## 5. Verify

- Sign in on the deployed site and generate an image/video/website —
  confirm it still works end-to-end and the plan chip's credit count
  ticks down.
- Open devtools → Network while doing that and confirm no request goes
  directly to `api.kie.ai`, `api.openai.com`, or
  `sheets.googleapis.com` — only to `<project>.supabase.co/functions/v1/*`.
- `curl` one of the new functions with no `Authorization` header and
  confirm you get `401`:
  ```
  curl -i -X POST https://xuqmlxjubpkntwvghgki.supabase.co/functions/v1/imagegen \
    -H "apikey: <anon key>" -H "Content-Type: application/json" -d "{}"
  ```
- Trigger the same authenticated action ~20+ times quickly and confirm
  you eventually get a `429` with a friendly "try again in a moment"
  toast instead of the request silently succeeding forever.
- In the Supabase dashboard, confirm a `profiles` row was created for a
  freshly signed-up test account, with `plan = 'trial'` and a
  `trial_ends_at` 7 days out.

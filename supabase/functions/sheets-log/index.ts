// BSL 2.0. Supabase Edge Function — Google Sheets read proxy.
//
// js/app.js used to call sheets.googleapis.com directly from the
// browser with a hardcoded API key, to read the shared Call Log /
// Onboarding Log spreadsheets — exposing both the key and (indirectly)
// client data to every visitor. This function proxies those reads
// server-side; a caller still cannot name an arbitrary spreadsheet.
//
// What changed after the pre-launch audit: the two sheet ids below are
// the AGENCY's own logs, and every signed-in account was served them.
// That is the wrong tenancy for a product sold per-agency — and the
// Onboarding Log's columns include EIN number, income range and net
// worth, so the moment real data lands in it, one customer's leads would
// be readable by every other customer. It is empty today; this closes it
// before it isn't.
//
// Resolution order per caller:
//   1. their OWN sheet, if they've connected one on the Integrations tab
//      (assistant_tools type='sheets') — read with the service account,
//      the same credential that writes rows there
//   2. the agency sheets, for admins only
//   3. nothing, plus notConfigured:true so the UI can explain why
//
// Two things changed again once we noticed THIS REPOSITORY IS PUBLIC:
//
//   * The agency spreadsheet ids used to be literals right here, which
//     published them. They now come from secrets. (The old values are
//     still in this file's git history, so the ids themselves have to be
//     treated as known — the protection is the sharing setting, below.)
//   * Reads used to go through GOOGLE_SHEETS_API_KEY, and an API key can
//     only read a spreadsheet shared with "anyone with the link". That
//     made public sharing a REQUIREMENT of the code: restricting the
//     sheets would have broken this page. Reads now use the service
//     account, so the sheets can be locked down to it and nobody else.
//     Nothing here uses the Sheets API key any more.
//
// Operator steps, in this order:
//   1. supabase secrets set AGENCY_CALL_LOG_SHEET_ID=<id> \
//        AGENCY_ONBOARDING_LOG_SHEET_ID=<id>
//   2. share both sheets with GOOGLE_SA_EMAIL (Viewer is enough to read;
//      Editor if you also want them as a dispatch destination)
//   3. in Drive, set General access to "Restricted" on both
//   4. supabase functions deploy sheets-log
//
// If step 3 lands before step 2 the read 403s — the error returned to an
// admin names the exact address to share with, so the fix is self-evident.

import { getAdminClient, requireUser, checkRate } from "../_shared/limits.ts";
import { isAdminEmail } from "../_shared/admin.ts";
import { serviceAccountToken } from "../_shared/dispatch.ts";

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 300;

// Agency-internal, admins only. Ids come from secrets so they are not
// published with the source; an unset id simply disables that log.
const SHEETS: Record<string, { envVar: string; sheetName: string }> = {
  "call-log": { envVar: "AGENCY_CALL_LOG_SHEET_ID", sheetName: "Call Log" },
  "onboarding-log": { envVar: "AGENCY_ONBOARDING_LOG_SHEET_ID", sheetName: "Onboarding Log" },
};

/* One read path for both the caller's own sheet and the agency's, so
   neither can quietly regress to a weaker credential than the other. */
async function readSheet(
  sheetId: string,
  sheetName: string,
): Promise<{ status: number; payload: unknown }> {
  const saEmail = (Deno.env.get("GOOGLE_SA_EMAIL") ?? "").trim();
  const saKey = (Deno.env.get("GOOGLE_SA_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n").trim();
  if (!saEmail || !saKey) {
    return { status: 500, payload: { error: "sheets_not_configured", detail: "Google Sheets is not configured on the server." } };
  }
  try {
    const token = await serviceAccountToken(saEmail, saKey);
    const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(sheetId) +
      "/values/" + encodeURIComponent(sheetName);
    const upstream = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    const text = await upstream.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { status: 502, payload: { error: "upstream_parse_failed", detail: text.slice(0, 200) } };
    }
    if (upstream.status === 403 || upstream.status === 404) {
      // Almost always "the sheet isn't shared with us" rather than a bug.
      return {
        status: upstream.status,
        payload: {
          error: "sheet_not_shared",
          detail: `Google returned ${upstream.status}. Share this spreadsheet with ${saEmail} (Viewer is enough) — it no longer needs to be public.`,
        },
      };
    }
    return { status: upstream.status, payload: parsed };
  } catch (err) {
    return { status: 502, payload: { error: "sheets_read_failed", detail: err instanceof Error ? err.message : "read failed" } };
  }
}

/** The caller's own connected Google Sheet destination, if any. */
async function ownSheet(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
): Promise<{ sheetId: string; sheetName: string } | null> {
  const { data } = await admin
    .from("assistant_tools")
    .select("config, created_at")
    .eq("user_id", userId)
    .eq("type", "sheets")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1);
  const config = (data?.[0]?.config ?? null) as { spreadsheetId?: string; sheetName?: string } | null;
  const sheetId = (config?.spreadsheetId ?? "").trim();
  if (!sheetId) return null;
  return { sheetId, sheetName: (config?.sheetName ?? "").trim() || "Sheet1" };
}

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") || "*")
  .split(",").map((s) => s.trim()).filter(Boolean);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "null");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  function json(payload: unknown, status: number): Response {
    return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = getAdminClient();
  const user = await requireUser(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { sheet?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const sheetKey = String(body.sheet || "");
  if (!Object.prototype.hasOwnProperty.call(SHEETS, sheetKey)) {
    return json({ error: "unknown_sheet" }, 400);
  }

  const rate = await checkRate(admin, user.id, "sheets-log", RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!rate.ok) return json(rate.body, rate.status);

  const mine = await ownSheet(admin, user.id);

  // Their own sheet, read with the service account — the same credential
  // that appends to it, so a privately-shared sheet works too.
  if (mine) {
    const result = await readSheet(mine.sheetId, mine.sheetName);
    return json(result.payload, result.status);
  }

  // No sheet of their own: everyone except an admin gets an empty result
  // and a reason, never the agency's spreadsheet.
  if (!isAdminEmail(user.email)) {
    return json({
      values: [],
      notConfigured: true,
      detail: "Connect a Google Sheet on the Integrations tab and your logs will appear here.",
    }, 200);
  }

  const target = SHEETS[sheetKey];
  const agencySheetId = (Deno.env.get(target.envVar) ?? "").trim();
  if (!agencySheetId) {
    return json({
      values: [],
      notConfigured: true,
      detail: `${target.envVar} is not set, so this agency log has no spreadsheet behind it.`,
    }, 200);
  }

  const result = await readSheet(agencySheetId, target.sheetName);
  return json(result.payload, result.status);
});

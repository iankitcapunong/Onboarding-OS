// BSL 2.0 — outbound destination dispatch, shared by agent-talk (real
// session.ended sends) and integration-test (owner-triggered test sends).
//
// One payload shape goes to every destination type; each sender adapts
// it to that system's API:
//   webhook — POST the JSON, HMAC-signed when a secret is configured
//   zapier  — POST the JSON to a Zap catch-hook (no signature; Zapier
//             hooks are capability URLs)
//   ghl     — GoHighLevel API 2.0: upsert the contact, attach the
//             collected answers as a note, optionally open a pipeline
//             opportunity
//   sheets  — append one row via a Google service account; the client
//             either link-shares the sheet (Anyone with the link →
//             Editor) or shares it with the SA's email directly
//
// Every attempt — success or failure — is recorded in
// integration_deliveries so the Integrations tab can show the client
// their data actually landed (or exactly why it didn't). Failures never
// throw out of dispatchToTool: a dead destination is the owner's
// problem to see in the log, not the visitor's.

import { getAdminClient } from "./limits.ts";

export type ExtractedContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export type Extracted = {
  contact: ExtractedContact;
  answers: Record<string, string>;
  summary: string;
};

export type SessionPayload = {
  event: string;
  sessionId: string | null;
  slug: string;
  assistantId: string | null;
  assistantName: string;
  startedAt: string | null;
  endedAt: string | null;
  messageCount: number;
  // Null when extraction was skipped or failed — receivers must not
  // assume these exist.
  contact: ExtractedContact | null;
  answers: Record<string, string> | null;
  summary: string | null;
  transcript: { role: string; content: string; created_at?: string }[];
};

export type ToolRow = {
  id: string;
  assistant_id: string | null;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
};

export type DeliveryResult = {
  ok: boolean;
  statusCode: number | null;
  detail: string;
};

// SSRF guard: only https on the default port, and none of the obvious
// private/loopback hosts. Decimal, hex and octal spellings of an address
// are normalised to dotted-quad by the URL parser before they reach the
// regexes below, so those bypasses are already covered. DNS rebinding is
// accepted residual risk — the payload carries no secrets beyond the
// visitor's own conversation.
export function isDispatchableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // A non-standard port is how an internal service gets reached on a host
  // that otherwise looks public; nothing legitimate needs one here.
  if (url.port !== "" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  // IPv6 literals arrive bracketed — [::1] and [::ffff:127.0.0.1] match
  // none of the IPv4 rules below, so reject the whole form.
  if (host.startsWith("[")) return false;
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// webhook / zapier — a signed (or plain) JSON POST
// ============================================================

async function sendWebhookLike(
  url: string,
  secret: string | null,
  payload: SessionPayload
): Promise<DeliveryResult> {
  if (!isDispatchableUrl(url)) {
    return { ok: false, statusCode: null, detail: "invalid or non-public https URL" };
  }
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-BSL-Signature"] = await hmacHex(secret, body);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      // Only the first URL is guarded. Following a redirect would hand
      // the destination back to the receiver, which could bounce us to
      // http://169.254.169.254/ or an internal port and skip every check
      // above. A webhook endpoint has no legitimate reason to redirect,
      // so treat a 3xx as a delivery failure the owner can see and fix.
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        statusCode: res.status,
        detail: `receiver redirected (${res.status}) — point the destination straight at its final https URL`,
      };
    }
    return {
      ok: res.ok,
      statusCode: res.status,
      detail: res.ok ? "delivered" : `receiver answered ${res.status}`,
    };
  } catch (err) {
    return { ok: false, statusCode: null, detail: err instanceof Error ? err.message : "network error" };
  }
}

// ============================================================
// ghl — GoHighLevel (LeadConnector) API 2.0
// ============================================================

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

type GhlConfig = {
  token?: string;
  locationId?: string;
  pipelineId?: string;
  stageId?: string;
  tags?: string[];
};

async function ghlFetch(
  token: string,
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

function ghlErrorDetail(step: string, status: number, data: Record<string, unknown>): string {
  const message = typeof data.message === "string"
    ? data.message
    : Array.isArray(data.message)
      ? data.message.join("; ")
      : "";
  return `${step} failed (${status})${message ? `: ${message.slice(0, 200)}` : ""}`;
}

async function sendGhl(config: GhlConfig, payload: SessionPayload): Promise<DeliveryResult> {
  const token = (config.token ?? "").trim();
  const locationId = (config.locationId ?? "").trim();
  if (!token || !locationId) {
    return { ok: false, statusCode: null, detail: "missing token or locationId in the destination config" };
  }

  const contact = payload.contact;
  const email = contact?.email?.trim() || "";
  const phone = contact?.phone?.trim() || "";
  if (!email && !phone) {
    // GHL's upsert dedupes on email/phone — without either there is no
    // contact to create, and that's worth surfacing to the owner.
    return { ok: false, statusCode: null, detail: "no email or phone was collected in this conversation — nothing to upsert" };
  }

  const upsertBody: Record<string, unknown> = {
    locationId,
    source: "BSL onboarding agent",
  };
  if (contact?.name) upsertBody.name = contact.name;
  if (email) upsertBody.email = email;
  if (phone) upsertBody.phone = phone;
  if (contact?.company) upsertBody.companyName = contact.company;
  if (Array.isArray(config.tags) && config.tags.length > 0) upsertBody.tags = config.tags;

  const upsert = await ghlFetch(token, "/contacts/upsert", upsertBody);
  if (!upsert.ok) {
    return { ok: false, statusCode: upsert.status, detail: ghlErrorDetail("contact upsert", upsert.status, upsert.data) };
  }
  const contactId = (upsert.data.contact as { id?: string } | undefined)?.id;
  if (!contactId) {
    return { ok: false, statusCode: upsert.status, detail: "contact upsert returned no contact id" };
  }

  // The collected answers land where a GHL user will actually read them:
  // a note on the contact. Best-effort — a note failure downgrades the
  // detail but the contact itself made it in.
  const noteLines: string[] = [];
  if (payload.summary) noteLines.push(payload.summary, "");
  for (const [key, value] of Object.entries(payload.answers ?? {})) {
    noteLines.push(`${key.replace(/_/g, " ")}: ${value}`);
  }
  noteLines.push("", `— BSL onboarding agent (${payload.assistantName}), session ${payload.sessionId ?? "test"}`);
  const note = await ghlFetch(token, `/contacts/${contactId}/notes`, { body: noteLines.join("\n").slice(0, 4000) });

  // Optional: open an opportunity so the contact shows up in the
  // client's pipeline, not just their contact list.
  let opportunityDetail = "";
  const pipelineId = (config.pipelineId ?? "").trim();
  const stageId = (config.stageId ?? "").trim();
  if (pipelineId && stageId) {
    const opp = await ghlFetch(token, "/opportunities/", {
      pipelineId,
      locationId,
      pipelineStageId: stageId,
      contactId,
      name: `${contact?.name || email || phone} — onboarding`,
      status: "open",
    });
    opportunityDetail = opp.ok ? ", opportunity opened" : `, ${ghlErrorDetail("opportunity", opp.status, opp.data)}`;
  }

  return {
    ok: true,
    statusCode: upsert.status,
    detail: `contact upserted${note.ok ? ", note added" : ", note failed"}${opportunityDetail}`,
  };
}

// ============================================================
// sheets — append one row via a Google service account
// ============================================================

type SheetsConfig = { spreadsheetId?: string; sheetName?: string };

/* Everything in a dispatched row traces back to what a visitor typed
   into a public /talk link — the extraction pass condenses their words,
   it doesn't sanitise them. Sheets treats a leading =, +, -, @ (or a
   leading tab/CR) as a formula, so an unescaped "name" of
   =IMPORTXML(...) would execute inside the CLIENT's spreadsheet and
   could pull every other lead in it out to an attacker's host. Prefixing
   an apostrophe makes Sheets store the text verbatim; it isn't shown in
   the cell. We also send valueInputOption=RAW below — belt and braces,
   since nothing we write is ever meant to be a formula. */
function sheetSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Standard two-legged service-account flow: sign a JWT with the SA's
// private key, trade it for a short-lived access token. The client
// link-shares their sheet (or shares it with the SA's email) — no
// per-client OAuth dance.
export async function serviceAccountToken(saEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = base64UrlEncode(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64UrlEncode(enc.encode(JSON.stringify({
    iss: saEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const unsigned = `${header}.${claims}`;
  const keySource = pemToDer(privateKeyPem);
  const keyBuf = new ArrayBuffer(keySource.length);
  new Uint8Array(keyBuf).set(keySource);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`token exchange failed (${res.status})`);
  }
  return data.access_token as string;
}

async function sendSheets(config: SheetsConfig, payload: SessionPayload): Promise<DeliveryResult> {
  const spreadsheetId = (config.spreadsheetId ?? "").trim();
  if (!spreadsheetId) {
    return { ok: false, statusCode: null, detail: "missing spreadsheetId in the destination config" };
  }
  const saEmail = (Deno.env.get("GOOGLE_SA_EMAIL") ?? "").trim();
  const saKey = (Deno.env.get("GOOGLE_SA_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n").trim();
  if (!saEmail || !saKey) {
    return {
      ok: false,
      statusCode: null,
      detail: "Google Sheets is not configured on the server (GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY secrets)",
    };
  }

  const contact = payload.contact;
  const answersText = Object.entries(payload.answers ?? {})
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join("; ");
  const row = [
    payload.endedAt ?? new Date().toISOString(),
    payload.assistantName,
    contact?.name ?? "",
    contact?.email ?? "",
    contact?.phone ?? "",
    contact?.company ?? "",
    payload.summary ?? "",
    answersText,
    payload.messageCount,
    payload.sessionId ?? "test",
  ].map((cell) => (typeof cell === "string" ? sheetSafe(cell) : cell));

  try {
    const token = await serviceAccountToken(saEmail, saKey);
    const sheetName = (config.sheetName ?? "").trim() || "Sheet1";
    const range = encodeURIComponent(`${sheetName}!A1`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ values: [row] }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = (data as { error?: { message?: string } }).error?.message ?? "";
      const hint = res.status === 403
        ? ` — set the sheet's link sharing to "Anyone with the link → Editor", or share it with ${saEmail}`
        : "";
      return { ok: false, statusCode: res.status, detail: `append failed (${res.status})${message ? `: ${message.slice(0, 200)}` : ""}${hint}` };
    }
    return { ok: true, statusCode: res.status, detail: "row appended" };
  } catch (err) {
    return { ok: false, statusCode: null, detail: err instanceof Error ? err.message : "sheets error" };
  }
}

// ============================================================
// dispatch + delivery log
// ============================================================

export async function dispatchToTool(tool: ToolRow, payload: SessionPayload): Promise<DeliveryResult> {
  const config = (tool.config ?? {}) as Record<string, unknown>;
  switch (tool.type) {
    case "webhook":
      return sendWebhookLike(
        String(config.url ?? ""),
        typeof config.secret === "string" && config.secret ? config.secret : null,
        payload
      );
    case "zapier":
      return sendWebhookLike(String(config.url ?? ""), null, payload);
    case "ghl":
      return sendGhl(config as GhlConfig, payload);
    case "sheets":
      return sendSheets(config as SheetsConfig, payload);
    default:
      return { ok: false, statusCode: null, detail: `unknown destination type "${tool.type}"` };
  }
}

// Fans the payload out to every matching enabled destination and logs
// one integration_deliveries row per attempt. Never throws.
export async function dispatchToDestinations(
  admin: ReturnType<typeof getAdminClient>,
  args: {
    ownerId: string;
    assistantId: string | null;
    sessionId: string | null;
    payload: SessionPayload;
  }
): Promise<void> {
  const { data: tools } = await admin
    .from("assistant_tools")
    .select("id, assistant_id, type, name, config, enabled")
    .eq("user_id", args.ownerId)
    .eq("enabled", true);
  const matching = ((tools ?? []) as ToolRow[]).filter(
    (t) => t.assistant_id === null || t.assistant_id === args.assistantId
  );
  if (matching.length === 0) return;

  await Promise.allSettled(
    matching.map(async (tool) => {
      const result = await dispatchToTool(tool, args.payload);
      await logDelivery(admin, {
        userId: args.ownerId,
        tool,
        sessionId: args.sessionId,
        event: args.payload.event,
        result,
      });
    })
  );
}

export async function logDelivery(
  admin: ReturnType<typeof getAdminClient>,
  args: {
    userId: string;
    tool: ToolRow;
    sessionId: string | null;
    event: string;
    result: DeliveryResult;
  }
): Promise<void> {
  await admin.from("integration_deliveries").insert({
    user_id: args.userId,
    tool_id: args.tool.id,
    session_id: args.sessionId,
    type: args.tool.type,
    tool_name: args.tool.name,
    event: args.event,
    ok: args.result.ok,
    status_code: args.result.statusCode,
    detail: args.result.detail.slice(0, 500),
  }).then(({ error }: { error: { message: string } | null }) => {
    if (error) console.error("delivery log failed:", error.message);
  });
}

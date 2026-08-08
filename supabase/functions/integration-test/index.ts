// BSL 2.0 — "Send test data" for a configured destination.
//
// The whole point of the Integrations tab is trust: before a client
// shares their /talk link, they want proof the collected data really
// lands in their GHL / sheet / Zap / endpoint. This function fires one
// clearly-labeled sample payload (event: "test") at a single
// assistant_tools row the caller owns, logs the attempt in
// integration_deliveries like a real send, and returns the result so
// the UI can show pass/fail immediately.
//
// Deploy:
//   supabase functions deploy integration-test

import { getAdminClient, requireUser, checkRate } from "../_shared/limits.ts";
import { dispatchToTool, logDelivery, type SessionPayload, type ToolRow } from "../_shared/dispatch.ts";

// Test sends hit real third-party APIs (and write real CRM rows) — keep
// the window tight enough that a stuck retry-clicker can't hammer them.
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 300;

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

// Unmistakably fake sample data — a receiver mapping fields sees every
// column filled, and nobody confuses it with a real lead.
function samplePayload(assistantName: string): SessionPayload {
  const now = new Date();
  return {
    event: "test",
    sessionId: null,
    slug: "test",
    assistantId: null,
    assistantName,
    startedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    endedAt: now.toISOString(),
    messageCount: 8,
    contact: {
      name: "Test Contact",
      email: "test@example.com",
      phone: "+15550100000",
      company: "Example Co",
    },
    answers: {
      business: "Example Co — a boutique fitness studio",
      main_offer: "12-week transformation program",
      location: "Austin, TX",
      ideal_customer: "Busy professionals aged 30-50",
      services_needed: "Client onboarding and lead follow-up",
    },
    summary:
      "TEST DELIVERY — sample data from the BSL Integrations tab. If you can read this, the destination is wired up correctly.",
    transcript: [
      { role: "assistant", content: "Hey! What would you like to use this for?" },
      { role: "user", content: "This is a test conversation." },
    ],
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

  let body: { toolId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const toolId = (body.toolId ?? "").trim();
  if (!toolId) return json({ error: "missing_tool" }, 400);

  const rate = await checkRate(admin, user.id, "integration-test", RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!rate.ok) return json(rate.body, rate.status);

  // Ownership is enforced here, not by RLS — this runs as service_role.
  const { data: tool, error: toolErr } = await admin
    .from("assistant_tools")
    .select("id, user_id, assistant_id, type, name, config, enabled")
    .eq("id", toolId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (toolErr) return json({ error: "lookup_failed", detail: toolErr.message }, 500);
  if (!tool) return json({ error: "not_found" }, 404);

  const result = await dispatchToTool(tool as ToolRow, samplePayload("Test assistant"));
  await logDelivery(admin, {
    userId: user.id,
    tool: tool as ToolRow,
    sessionId: null,
    event: "test",
    result,
  });

  return json({ ok: result.ok, statusCode: result.statusCode, detail: result.detail }, 200);
});

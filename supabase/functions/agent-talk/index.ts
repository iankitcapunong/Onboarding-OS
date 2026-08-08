// agent-talk — Supabase Edge Function
// Public, unauthenticated endpoint behind the "/talk/<slug>" page: it's
// how a client's own customer actually talks to the AI onboarding agent
// once its owner has deployed it. There is no signed-in visitor here —
// the slug itself is the only credential, and usage is metered against
// the DEPLOYING account's own rate limit + credit balance (mirrors how
// every other paid-API proxy in this repo works, just keyed by the
// deployment owner instead of the caller, since the caller has no
// account at all).
//
// Deploy (once, from this repo's root, with the Supabase CLI):
//   supabase functions deploy agent-talk --no-verify-jwt
// (config.toml also sets verify_jwt = false for this function, so a
// dashboard-triggered deploy picks the same setting up.)

import { getAdminClient, checkRate, checkAndSpendCredits, getPlan } from "../_shared/limits.ts";
import { dispatchToDestinations, type Extracted, type SessionPayload } from "../_shared/dispatch.ts";

const ANTHROPIC_MODEL = "claude-opus-4-8";
const OPENAI_MODEL = "gpt-5.6-sol";
const MAX_OUTPUT_TOKENS = 800;
// End-of-session extraction: one LLM pass that turns the free-text
// transcript into { contact, answers, summary } — the structured data
// the CRM/webhook/sheet destinations actually need. Metered like one
// chat turn against the owner; if they're out of credits the dispatch
// still fires, just with the raw transcript only.
const EXTRACT_MAX_TOKENS = 1000;
const EXTRACT_COST = 10;
const EXTRACT_INPUT_CHAR_CAP = 24000;

// Mirrors src/lib/featureGating.ts's CREDIT_COSTS LOW_COST tier — a
// conversational turn is cheap compared to brible's page generations.
const COST = 10;
// Per-deployment, not per-visitor (there's no visitor identity to key
// on) — stops one deployed link from being hammered, same rationale as
// brible's RATE_LIMIT.
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 300;
const MAX_HISTORY_TURNS = 20;
const MAX_MESSAGE_LENGTH = 4000;
// Per-turn caps alone don't bound a turn's cost: 20 turns x 4000 chars is
// ~80KB of caller-chosen input, billed at the same flat 10 credits as a
// one-line reply. This ceiling is on the WHOLE history, oldest dropped
// first, so a long conversation degrades instead of scaling our spend.
const MAX_HISTORY_CHARS = 24000;
// The system prompt comes from the deployment row, capped in the database
// by agent_deployments_prompt_size (migration 0012). This is the belt to
// that braces: rows written before the constraint existed are still
// trimmed here rather than sent whole to the model.
const MAX_SYSTEM_PROMPT_CHARS = 20000;

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

type ChatTurn = { role: "user" | "assistant"; content: string };

interface TalkBody {
  slug?: string;
  message?: string;
  history?: ChatTurn[];
  // Optional, generated client-side by the /talk page (crypto.randomUUID)
  // — presence turns on transcript logging; absence = the old behavior,
  // so cached pages from before this shipped keep working.
  sessionId?: string;
  // "end" marks the session finished (extracts structured data and
  // fires the owner's destinations); "init" fetches the assistant's
  // display name + first message for the page header — both instead of
  // sending a chat message.
  action?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Past this many stored messages the chat keeps working but stops
// logging — a runaway session can't grow a row set without bound.
const MAX_LOGGED_MESSAGES = 240;

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  function json(payload: unknown, status: number): Response {
    return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: TalkBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const slug = (body.slug ?? "").trim();
  const message = (body.message ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
  const action = (body.action ?? "").trim();
  const sessionId = typeof body.sessionId === "string" && UUID_RE.test(body.sessionId.trim())
    ? body.sessionId.trim().toLowerCase()
    : null;
  if (!slug) return json({ error: "missing_slug" }, 400);
  if (action !== "end" && action !== "init" && !message) return json({ error: "missing_message" }, 400);

  const admin = getAdminClient();
  const { data: deployment, error: lookupErr } = await admin
    .from("agent_deployments")
    .select("id, user_id, assistant_id, persona, prompt, voice, first_message, assistants(name)")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupErr) return json({ error: "lookup_failed", detail: lookupErr.message }, 500);
  if (!deployment) return json({ error: "not_found" }, 404);

  const assistantName =
    (deployment.assistants as { name?: string } | null)?.name?.trim() || "Onboarding agent";

  // Free, unmetered page-load lookup — one indexed select, the same
  // work every chat turn already does before its rate check.
  if (action === "init") {
    return json({ name: assistantName, firstMessage: deployment.first_message ?? "" }, 200);
  }

  // The session id is client-supplied, so an existing session must
  // belong to the SAME deployment as the slug being messaged — a forged
  // id must not read into or write onto another tenant's logs.
  let existingSession: { id: string; deployment_id: string; message_count: number; ended_at: string | null } | null = null;
  if (sessionId) {
    const { data: sess } = await admin
      .from("agent_sessions")
      .select("id, deployment_id, message_count, ended_at")
      .eq("id", sessionId)
      .maybeSingle();
    existingSession = sess ?? null;
    if (existingSession && existingSession.deployment_id !== deployment.id) {
      return json({ error: "session_mismatch" }, 409);
    }
  }

  // Throttle BEFORE the end branch: ending is unauthenticated like every
  // other public call here, so it needs the same ceiling. It used to sit
  // after this check and was the one path with no limit at all.
  const rate = await checkRate(admin, deployment.user_id, "agent-talk", RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!rate.ok) return json(rate.body, rate.status);

  if (action === "end") {
    if (!sessionId) return json({ error: "missing_session" }, 400);
    if (existingSession && !existingSession.ended_at) {
      const endedAt = new Date().toISOString();
      /* Claim the session with the update itself rather than trusting the
         read above. Reading ended_at, deciding, then writing is three
         round-trips: concurrent ends all read null, all decide to
         proceed, and each one re-runs the extraction LLM call, re-spends
         the OWNER's credits and re-fires every destination — duplicate
         CRM contacts, duplicate sheet rows, duplicate signed webhooks the
         receiver has no way to tell apart. `.is("ended_at", null)` makes
         the database pick exactly one winner: losers update 0 rows and
         come back with an empty array. */
      const { data: claimed, error: claimErr } = await admin
        .from("agent_sessions")
        .update({ ended_at: endedAt })
        .eq("id", sessionId)
        .is("ended_at", null)
        .select("id");
      if (claimErr) {
        console.error("session claim failed:", claimErr.message);
      } else if (claimed && claimed.length > 0) {
        // Extract + fire the owner's destinations — only for the winner,
        // and never failing the response the visitor is waiting on.
        try {
          await finalizeSession(admin, {
            sessionId,
            slug,
            assistantId: deployment.assistant_id,
            assistantName,
            ownerId: deployment.user_id,
            endedAt,
          });
        } catch (err) {
          console.error("session finalize failed:", err instanceof Error ? err.message : err);
        }
      }
    }
    return json({ ok: true }, 200);
  }

  const plan = await getPlan(admin, deployment.user_id);
  const credit = await checkAndSpendCredits(admin, deployment.user_id, plan, COST);
  if (!credit.ok) {
    // Deliberately vague to the anonymous visitor — "out of credits" is
    // the deploying account's problem to see and fix, not theirs.
    return json({ error: "unavailable", detail: "This onboarding agent is temporarily unavailable. Please try again later." }, 503);
  }

  const systemPrompt = [deployment.persona, deployment.prompt, deployment.voice ? `VOICE:\n- ${deployment.voice}` : ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_SYSTEM_PROMPT_CHARS);

  const trimmed: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((h): h is ChatTurn => (h?.role === "user" || h?.role === "assistant") && typeof h?.content === "string")
        .slice(-MAX_HISTORY_TURNS)
        .map((h) => ({ role: h.role, content: h.content.slice(0, MAX_MESSAGE_LENGTH) }))
    : [];

  // Walk back from the most recent turn, keeping what fits in the budget,
  // so the model still gets the part of the conversation that matters.
  const history: ChatTurn[] = [];
  let historyChars = 0;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    historyChars += trimmed[i].content.length;
    if (historyChars > MAX_HISTORY_CHARS) break;
    history.unshift(trimmed[i]);
  }

  const result = await callLLM(systemPrompt, history, message, MAX_OUTPUT_TOKENS);
  if ("error" in result) return json(result.error, result.status);

  // Transcript logging is strictly best-effort — a logging failure must
  // never fail the chat reply the visitor is waiting on.
  if (sessionId) {
    try {
      await logTurn(admin, {
        sessionId,
        deploymentId: deployment.id,
        ownerId: deployment.user_id,
        slug,
        isNewSession: !existingSession,
        loggedCount: existingSession?.message_count ?? 0,
        userText: message,
        assistantText: result.text,
      });
    } catch (err) {
      console.error("session logging failed:", err instanceof Error ? err.message : err);
    }
  }

  return json({ reply: result.text }, 200);
});

async function logTurn(
  admin: ReturnType<typeof getAdminClient>,
  turn: {
    sessionId: string;
    deploymentId: string;
    ownerId: string;
    slug: string;
    isNewSession: boolean;
    loggedCount: number;
    userText: string;
    assistantText: string;
  }
): Promise<void> {
  if (turn.loggedCount >= MAX_LOGGED_MESSAGES) return;

  if (turn.isNewSession) {
    await admin.from("agent_sessions").insert({
      id: turn.sessionId,
      deployment_id: turn.deploymentId,
      user_id: turn.ownerId,
      slug: turn.slug,
    });
  }

  const { error: msgErr } = await admin.from("agent_messages").insert([
    { session_id: turn.sessionId, role: "user", content: turn.userText },
    { session_id: turn.sessionId, role: "assistant", content: turn.assistantText },
  ]);
  if (msgErr) throw new Error(msgErr.message);

  // Exact count from the messages table rather than a racy +2 — two
  // parallel turns on the same session can't drift the counter.
  const { count } = await admin
    .from("agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", turn.sessionId);
  await admin
    .from("agent_sessions")
    .update({ last_message_at: new Date().toISOString(), message_count: count ?? turn.loggedCount + 2 })
    .eq("id", turn.sessionId);
}

// ============================================================
// Session finalize — extract structured data, then dispatch
// ============================================================

const EXTRACT_SYSTEM_PROMPT = [
  "You extract structured data from an onboarding-conversation transcript (AGENT asks, VISITOR answers).",
  "Return ONLY a JSON object — no prose, no code fences — exactly this shape:",
  '{ "contact": { "name": string|null, "email": string|null, "phone": string|null, "company": string|null },',
  '  "answers": { "<topic_in_snake_case>": "<the visitor\'s answer, condensed>", ... },',
  '  "summary": "<2-3 plain sentences: who this is and what they want>" }',
  "Rules:",
  "- Only state facts the VISITOR actually gave. Use null for contact fields never mentioned.",
  '- One "answers" entry per distinct question the agent asked (e.g. "business", "main_offer", "location", "ideal_customer", "services_needed"). Omit topics never discussed.',
  "- Keep every value under 300 characters.",
].join("\n");

function coerceContactField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
}

function parseExtraction(text: string): Extracted | null {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as { contact?: Record<string, unknown>; answers?: Record<string, unknown>; summary?: unknown };
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj.answers ?? {})) {
    if (typeof value === "string" && value.trim()) {
      answers[key.slice(0, 60)] = value.trim().slice(0, 300);
    }
  }
  return {
    contact: {
      name: coerceContactField(obj.contact?.name),
      email: coerceContactField(obj.contact?.email),
      phone: coerceContactField(obj.contact?.phone),
      company: coerceContactField(obj.contact?.company),
    },
    answers,
    summary: typeof obj.summary === "string" ? obj.summary.trim().slice(0, 1000) : "",
  };
}

async function finalizeSession(
  admin: ReturnType<typeof getAdminClient>,
  ctx: {
    sessionId: string;
    slug: string;
    assistantId: string | null;
    assistantName: string;
    ownerId: string;
    endedAt: string;
  }
): Promise<void> {
  const { data: session } = await admin
    .from("agent_sessions")
    .select("started_at, message_count")
    .eq("id", ctx.sessionId)
    .maybeSingle();
  const { data: messages } = await admin
    .from("agent_messages")
    .select("role, content, created_at")
    .eq("session_id", ctx.sessionId)
    .order("id", { ascending: true });
  const transcript = (messages ?? []) as { role: string; content: string; created_at: string }[];

  // Extraction is worth one LLM call only when the visitor actually
  // said something. Metered against the owner like a chat turn; out of
  // credits (or a flaky model) degrades to transcript-only dispatch
  // rather than dropping the delivery.
  let extracted: Extracted | null = null;
  if (transcript.length >= 2) {
    try {
      const plan = await getPlan(admin, ctx.ownerId);
      const credit = await checkAndSpendCredits(admin, ctx.ownerId, plan, EXTRACT_COST);
      if (credit.ok) {
        const lines = transcript
          .map((m) => `${m.role === "assistant" ? "AGENT" : "VISITOR"}: ${m.content}`)
          .join("\n")
          .slice(0, EXTRACT_INPUT_CHAR_CAP);
        const result = await callLLM(EXTRACT_SYSTEM_PROMPT, [], lines, EXTRACT_MAX_TOKENS);
        if (!("error" in result)) extracted = parseExtraction(result.text);
        if (extracted) {
          await admin
            .from("agent_sessions")
            .update({ extracted, extracted_at: new Date().toISOString() })
            .eq("id", ctx.sessionId);
        }
      }
    } catch (err) {
      console.error("extraction failed:", err instanceof Error ? err.message : err);
    }
  }

  const payload: SessionPayload = {
    event: "session.ended",
    sessionId: ctx.sessionId,
    slug: ctx.slug,
    assistantId: ctx.assistantId,
    assistantName: ctx.assistantName,
    startedAt: session?.started_at ?? null,
    endedAt: ctx.endedAt,
    messageCount: session?.message_count ?? 0,
    contact: extracted?.contact ?? null,
    answers: extracted?.answers ?? null,
    summary: extracted?.summary || null,
    transcript,
  };

  await dispatchToDestinations(admin, {
    ownerId: ctx.ownerId,
    assistantId: ctx.assistantId,
    sessionId: ctx.sessionId,
    payload,
  });
}

type LLMResult = { text: string } | { error: Record<string, unknown>; status: number };

// Same provider-selection rule as brible/index.ts's callLLM — kept in
// sync by hand since each Edge Function deploys independently.
async function callLLM(systemPrompt: string, history: ChatTurn[], message: string, maxTokens: number): Promise<LLMResult> {
  const forced = (Deno.env.get("BRIBLE_PROVIDER") || "").trim().toLowerCase();
  const hasOpenAI = !!Deno.env.get("OPENAI_API_KEY");
  const hasAnthropic = !!Deno.env.get("ANTHROPIC_API_KEY");
  const provider = forced === "openai" || forced === "anthropic" ? forced : (hasAnthropic && !hasOpenAI ? "anthropic" : "openai");

  if (provider === "openai") {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return { error: { error: "OPENAI_API_KEY secret is not set" }, status: 500 };
    return callOpenAI(key, systemPrompt, history, message, maxTokens);
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { error: { error: "ANTHROPIC_API_KEY secret is not set" }, status: 500 };
  return callAnthropic(key, systemPrompt, history, message, maxTokens);
}

// Non-streaming (unlike brible's callAnthropic) — a chat turn's 800-token
// ceiling is well inside a normal HTTP timeout, so the extra complexity
// of accumulating an SSE stream server-side buys nothing here.
async function callAnthropic(apiKey: string, systemPrompt: string, history: ChatTurn[], message: string, maxTokens: number): Promise<LLMResult> {
  const messages = [...history, { role: "user" as const, content: message }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { error: { error: "anthropic_error", status: res.status, detail: detail.slice(0, 500) }, status: 502 };
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  if (data.stop_reason === "refusal") {
    return { error: { error: "refused", detail: "The model declined this request." }, status: 422 };
  }
  return { text };
}

async function callOpenAI(apiKey: string, systemPrompt: string, history: ChatTurn[], message: string, maxTokens: number): Promise<LLMResult> {
  const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_completion_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { error: { error: "openai_error", status: res.status, detail: detail.slice(0, 500) }, status: 502 };
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    return { error: { error: "refused", detail: "The model declined this request." }, status: 422 };
  }
  return { text: choice?.message?.content ?? "" };
}

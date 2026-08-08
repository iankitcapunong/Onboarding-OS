// Assistant prompt rewrite. Supabase Edge Function
// Proxies "rewrite this agent's persona/prompt" requests to an LLM so
// the API key never reaches the browser. Auth: Supabase JWT (the
// function rejects anonymous calls).
//
// Still named `brible` because that is the deployed function name and
// the client's callBrible() wrapper points at it. The Brible website
// builder it was originally written for has been removed from the app;
// the only surviving caller is the Assistants tab's "rewrite with AI"
// action (src/app/app/assistants/[id]/page.tsx). Any other mode is
// rejected with `unsupported_mode`.
//
// Supports two interchangeable backends — set whichever secret you
// have, deploy, and it's picked up automatically:
//
//   OpenAI (default when both/neither are set):
//     supabase secrets set OPENAI_API_KEY=sk-...
//   Anthropic:
//     supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   (optional) force a provider regardless of which keys are set:
//     supabase secrets set BRIBLE_PROVIDER=openai   # or "anthropic"
//
// Deploy (once, from this repo's root, with the Supabase CLI):
//   supabase link --project-ref xuqmlxjubpkntwvghgki
//   supabase secrets set OPENAI_API_KEY=sk-...   (or ANTHROPIC_API_KEY)
//   supabase functions deploy brible
//
// Models: claude-opus-4-8 ($5/$25 per MTok) for Anthropic, gpt-5.6-sol
// ($5/$30 per MTok) for OpenAI. Change ANTHROPIC_MODEL / OPENAI_MODEL
// below for cheaper output (e.g. "claude-sonnet-5" or "gpt-5.6-terra").
//
// Mode: "rewrite-prompt" — revise an assistant's persona + prompt from
// a plain-English instruction, returning { persona, prompt } as JSON.

import { getAdminClient, requireUser, checkRate, checkAndSpendCredits, getPlan } from "../_shared/limits.ts";

const ANTHROPIC_MODEL = "claude-opus-4-8";
const OPENAI_MODEL = "gpt-5.6-sol";
const REWRITE_PROMPT_MAX_TOKENS = 2000;

// Mirrors src/lib/featureGating.ts's CREDIT_COSTS.brible (high tier).
const FLAT_COST = 50;
// At most this many brible calls per user per window, regardless of
// credits — stops scripted bursts even mid-allowance.
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 300;

// Restrict in production via `supabase secrets set ALLOWED_ORIGIN=https://yourdomain.com`
// (comma-separate multiple origins). Falls back to "*" only when unset,
// so local/dev keeps working out of the box.
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

const REWRITE_PROMPT_SYSTEM_PROMPT = `You are editing the system persona and instructions for an onboarding AI agent. You'll be given the agent's current persona (a short voice/tone description) and its current prompt (the step-by-step instructions it follows), plus a plain-English instruction describing what to change.

Apply the instruction as a minimal, targeted revision — preserve everything not affected by it. Keep the persona short (1-3 sentences) and the prompt as clear numbered/structured instructions, matching the style and length of what's given to you.

Output contract (non-negotiable): return ONLY valid JSON, no markdown fences, no commentary, matching exactly this shape:
{ "persona": string, "prompt": string }`;

interface BribleBody {
  mode?: "rewrite-prompt";
  instruction?: string;
  currentPersona?: string;
  currentPrompt?: string;
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  function json(payload: unknown, status: number): Response {
    return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Supabase verifies the JWT signature before invoking the function
  // (verify_jwt defaults to true, see supabase/config.toml), but that
  // only proves the token is valid — it doesn't rate-limit or meter
  // usage. requireUser()/checkRate()/checkAndSpendCredits() below are
  // what actually stop one account from hammering this endpoint or
  // exceeding its plan's monthly allowance. Which LLM backend to use is
  // resolved per-request inside callLLM(), based on which secret(s) are
  // configured.
  const admin = getAdminClient();
  const user = await requireUser(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: BribleBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const cost = FLAT_COST;

  const rate = await checkRate(admin, user.id, "brible", RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!rate.ok) return json(rate.body, rate.status);

  const plan = await getPlan(admin, user.id);
  const credit = await checkAndSpendCredits(admin, user.id, plan, cost);
  if (!credit.ok) return json(credit.body, credit.status);

  if (body.mode === "rewrite-prompt") {
    const instruction = (body.instruction ?? "").slice(0, 2000);
    if (!instruction) return json({ error: "missing_instruction" }, 400);
    const userContent =
      `Current persona:\n${body.currentPersona ?? ""}\n\nCurrent prompt:\n${body.currentPrompt ?? ""}\n\nInstruction: ${instruction}`;
    const result = await callLLM(REWRITE_PROMPT_SYSTEM_PROMPT, userContent, REWRITE_PROMPT_MAX_TOKENS);
    if ("error" in result) return json(result.error, result.status);
    let parsed: { persona?: string; prompt?: string };
    try {
      const cleaned = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return json({ error: "bad_output", detail: result.text.slice(0, 200) }, 502);
    }
    if (!parsed.persona || !parsed.prompt) {
      return json({ error: "bad_output", detail: "missing persona/prompt" }, 502);
    }
    return json({ persona: parsed.persona, prompt: parsed.prompt, model: result.model, remaining: credit.remaining }, 200);
  }

  // The Brible website builder was removed; this function now serves
  // only the Assistants tab's prompt rewrite. Anything else is a stale
  // caller.
  return json({ error: "unsupported_mode", detail: "This function only supports mode: \"rewrite-prompt\"." }, 400);
});

type LLMResult =
  | { text: string; stopReason: string | null; model: string }
  | { error: Record<string, unknown>; status: number };

// Picks a backend for this request: an explicit BRIBLE_PROVIDER secret
// wins if set; otherwise, whichever key is actually configured is used
// (Anthropic if only ANTHROPIC_API_KEY is set); OpenAI is the default
// when both or neither are configured.
async function callLLM(systemPrompt: string, userContent: string, maxTokens: number): Promise<LLMResult> {
  const forced = (Deno.env.get("BRIBLE_PROVIDER") || "").trim().toLowerCase();
  const hasOpenAI = !!Deno.env.get("OPENAI_API_KEY");
  const hasAnthropic = !!Deno.env.get("ANTHROPIC_API_KEY");
  const provider = forced === "openai" || forced === "anthropic" ? forced : (hasAnthropic && !hasOpenAI ? "anthropic" : "openai");

  if (provider === "openai") {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return { error: { error: "OPENAI_API_KEY secret is not set" }, status: 500 };
    return callOpenAI(key, systemPrompt, userContent, maxTokens);
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { error: { error: "ANTHROPIC_API_KEY secret is not set" }, status: 500 };
  return callAnthropic(key, systemPrompt, userContent, maxTokens);
}

// Streams a Claude completion and accumulates it server-side (so long
// generations don't hit non-streaming HTTP timeouts).
async function callAnthropic(apiKey: string, systemPrompt: string, userContent: string, maxTokens: number): Promise<LLMResult> {
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
      stream: true,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return { error: { error: "anthropic_error", status: res.status, detail: detail.slice(0, 500) }, status: 502 };
  }

  let text = "";
  let stopReason: string | null = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          text += evt.delta.text;
        } else if (evt.type === "message_delta" && evt.delta?.stop_reason) {
          stopReason = evt.delta.stop_reason;
        }
      } catch { /* ignore partial lines */ }
    }
  }

  if (stopReason === "refusal") {
    return { error: { error: "refused", detail: "The model declined this request." }, status: 422 };
  }
  return { text, stopReason, model: ANTHROPIC_MODEL };
}

// Streams an OpenAI chat completion and accumulates it server-side,
// same rationale as callAnthropic. Uses max_completion_tokens (not the
// older max_tokens) — required by current-generation reasoning-capable
// chat models; if OpenAI ever renames this again, the error surfaced
// back to the client will name the bad parameter.
async function callOpenAI(apiKey: string, systemPrompt: string, userContent: string, maxTokens: number): Promise<LLMResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_completion_tokens: maxTokens,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return { error: { error: "openai_error", status: res.status, detail: detail.slice(0, 500) }, status: 502 };
  }

  let text = "";
  let finishReason: string | null = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        const choice = evt.choices && evt.choices[0];
        if (choice?.delta?.content) text += choice.delta.content;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      } catch { /* ignore partial lines */ }
    }
  }

  if (finishReason === "content_filter") {
    return { error: { error: "refused", detail: "The model declined this request." }, status: 422 };
  }
  return { text, stopReason: finishReason, model: OPENAI_MODEL };
}

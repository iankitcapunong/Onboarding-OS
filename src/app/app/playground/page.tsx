"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callBrible } from "@/lib/edgeFunctions";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";

const DEFAULT_PERSONA =
  "You are the onboarding agent for an AI marketing systems company. " +
  "You are warm, direct, and plain-spoken. No hype, no jargon. You sound " +
  "like a sharp operations lead who respects the client's time.";

const DEFAULT_PROMPT =
  "Your job is to onboard a new client through a natural CONVERSATION, never a form.\n\n" +
  "Run it in this order:\n" +
  "1. Greet briefly, then ask ONE question: what they want to use this for\n" +
  "   (onboarding their clients, interviewing/screening, or another use case).\n" +
  "2. Based on their answer, collect what matters, one question at a time:\n" +
  "   - their business and what they do\n" +
  "   - their main offer\n" +
  "   - their location / market\n" +
  "   - their ideal customer (ICP)\n" +
  "   - which services they actually need built\n" +
  "3. Ask ONE question at a time. Never stack questions.\n" +
  "4. Reflect back what you heard in plain words and confirm it.\n" +
  "5. Close with clear next steps and a warm goodbye.";

const DEFAULT_VOICE = "warm, direct, and plain-spoken — no hype, no jargon";

// Voice is stored separately but folded into the saved prompt as a
// trailing VOICE: block, since the call agent only reads one prompt.
const VOICE_BLOCK_RE = /\n\nVOICE:\n[\s\S]*$/;

function foldVoice(prompt: string, voice: string) {
  const base = prompt.replace(VOICE_BLOCK_RE, "");
  const v = (voice || "").trim();
  if (!v) return base;
  return base.replace(/\s+$/, "") + "\n\nVOICE:\n- " + v;
}

type PlaygroundState = { persona: string; voice: string; prompt: string };

export default function PlaygroundPage() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { syncCreditsFromServer } = useCredits();
  const toast = useToast();
  const [supabase] = useState(() => createClient());

  const storeKey = scopedKey("bsl_playground", user?.email || "guest");
  const [state, setState] = useState<PlaygroundState>(() => {
    const stored = getJSON<Partial<PlaygroundState>>(storeKey);
    return {
      persona: stored?.persona ?? DEFAULT_PERSONA,
      voice: stored?.voice ?? DEFAULT_VOICE,
      prompt: stored?.prompt ?? foldVoice(DEFAULT_PROMPT, DEFAULT_VOICE),
    };
  });
  const [change, setChange] = useState("");
  const [rewriting, setRewriting] = useState(false);

  async function handleUpdate() {
    const instruction = change.trim();
    if (!instruction) {
      toast("Describe the change you want first");
      return;
    }
    setRewriting(true);
    try {
      const out = await callBrible<{ remaining?: number; persona?: string; prompt?: string }>(supabase, {
        mode: "rewrite-prompt",
        instruction,
        currentPersona: state.persona,
        currentPrompt: state.prompt,
      });
      if (typeof out.remaining === "number") syncCreditsFromServer(out.remaining);
      setState((prev) => ({
        ...prev,
        persona: out.persona?.trim() || prev.persona,
        prompt: out.prompt?.trim() || prev.prompt,
      }));
      setChange("");
      toast("Prompt rewritten. Review it, then hit Save changes.", true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "not-signed-in") {
        setState((prev) => ({
          ...prev,
          prompt: prev.prompt.replace(/\s+$/, "") + "\n\nADDITIONAL DIRECTIVE:\n- " + instruction,
        }));
        setChange("");
        toast("Change added to the prompt as a directive.", true);
      } else {
        toast(message || "The AI rewrite service is unavailable right now");
      }
    } finally {
      setRewriting(false);
    }
  }

  function handleSave() {
    const next = { ...state, prompt: foldVoice(state.prompt, state.voice) };
    setState(next);
    setJSON(storeKey, next);
    logActivity("system", "Updated the onboarding agent prompt in the playground");
    toast("Prompt saved", true);
  }

  function handleReset() {
    if (!confirm("Reset the voice, persona and prompt to the defaults?")) return;
    const next = { voice: DEFAULT_VOICE, persona: DEFAULT_PERSONA, prompt: foldVoice(DEFAULT_PROMPT, DEFAULT_VOICE) };
    setState(next);
    setJSON(storeKey, next);
    toast("Restored the default prompt", true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Prompt playground</h2>
          <p className="page-sub">Change how your onboarding flow behaves. Describe what you want in plain English and it rewrites the prompt for you — no need to touch the system prompt.</p>
        </div>
      </div>

      <div className="pp-layout">
        <div className="pp-col">
          <div className="panel">
            <h3>Tell it what to change</h3>
            <p className="panel-sub">Plain English. Example: &ldquo;Make this an AI interviewer that screens sales candidates and asks about their closing experience.&rdquo;</p>
            <div className="field">
              <label className="sr-only" htmlFor="ppChange">Describe the change</label>
              <textarea
                className="input pp-change"
                id="ppChange"
                rows={5}
                placeholder="Describe the change…"
                value={change}
                onChange={(e) => setChange(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={handleUpdate} disabled={rewriting}>
              <span className="btn-label">{rewriting ? "Rewriting…" : "Update prompt"}</span>
            </button>
            <p className="hint" style={{ marginTop: 10 }}>AI rewrites are included in your plan — no setup needed.</p>
          </div>
        </div>

        <div className="pp-col">
          <div className="panel">
            <span className="pp-label">Voice &amp; tone</span>
            <p className="panel-sub">How the AI should sound on calls. Folded into the system prompt when you save.</p>
            <textarea
              className="input pp-editor"
              rows={3}
              placeholder="e.g. warm, direct, a little playful — no corporate jargon"
              spellCheck={false}
              value={state.voice}
              onChange={(e) => setState((prev) => ({ ...prev, voice: e.target.value }))}
            />
          </div>
          <div className="panel">
            <span className="pp-label">Persona (company background)</span>
            <textarea
              className="input pp-editor"
              rows={5}
              spellCheck={false}
              value={state.persona}
              onChange={(e) => setState((prev) => ({ ...prev, persona: e.target.value }))}
            />
          </div>
          <div className="panel">
            <span className="pp-label">Onboarding flow prompt</span>
            <textarea
              className="input pp-editor pp-mono"
              rows={16}
              spellCheck={false}
              value={state.prompt}
              onChange={(e) => setState((prev) => ({ ...prev, prompt: e.target.value }))}
            />
          </div>
          <div className="pp-saverow">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>Reset to default</button>
            <button type="button" className="btn btn-primary pp-save" onClick={handleSave}>
              <span className="btn-label">Save changes</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

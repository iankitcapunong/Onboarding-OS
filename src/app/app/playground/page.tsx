"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callBrible } from "@/lib/edgeFunctions";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";

type AgentTypeKey = "receptionist" | "onboarding" | "scheduler" | "support" | "chat";

type AgentTypeDef = {
  key: AgentTypeKey;
  label: string;
  blurb: string;
  persona: string;
  prompt: string;
  voice: string;
};

const AGENT_TYPES: AgentTypeDef[] = [
  {
    key: "receptionist",
    label: "AI Receptionist",
    blurb: "Answers incoming calls, greets callers, and routes or takes messages.",
    persona:
      "You are the front-desk receptionist for the business. You are friendly, " +
      "efficient, and professional. You sound like a well-trained office receptionist " +
      "who makes every caller feel welcomed and taken care of.",
    prompt:
      "Your job is to answer incoming calls the way a great front-desk receptionist would.\n\n" +
      "Run it in this order:\n" +
      "1. Greet the caller warmly and state the business name.\n" +
      "2. Ask how you can help them today.\n" +
      "3. Figure out whether they need: to reach someone specific, general information, " +
      "or to leave a message.\n" +
      "4. If they need a person, collect their name, callback number, and a short reason " +
      "for the call, then let them know someone will follow up.\n" +
      "5. If they have a general question, answer it plainly using what you know about the " +
      "business; if you don't know, say so and offer to have someone call back.\n" +
      "6. Ask ONE question at a time. Never stack questions.\n" +
      "7. Close with a warm, brief goodbye.",
    voice: "friendly, efficient, and professional — like a great front-desk receptionist",
  },
  {
    key: "onboarding",
    label: "AI Onboarding",
    blurb: "Onboards new clients through a natural conversation, not a form.",
    persona:
      "You are the onboarding agent for an AI marketing systems company. " +
      "You are warm, direct, and plain-spoken. No hype, no jargon. You sound " +
      "like a sharp operations lead who respects the client's time.",
    prompt:
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
      "5. Close with clear next steps and a warm goodbye.",
    voice: "warm, direct, and plain-spoken — no hype, no jargon",
  },
  {
    key: "scheduler",
    label: "AI Appointment Scheduler",
    blurb: "Books, reschedules, and confirms appointments on the business's calendar.",
    persona:
      "You are the appointment scheduling agent for the business. You are organized, " +
      "courteous, and precise about dates and times. You sound like a dependable " +
      "office coordinator who never lets a booking slip through the cracks.",
    prompt:
      "Your job is to book, reschedule, or cancel appointments through natural conversation.\n\n" +
      "Run it in this order:\n" +
      "1. Greet briefly and ask whether they want to book a new appointment, reschedule, " +
      "or cancel one.\n" +
      "2. For a new booking, collect one at a time:\n" +
      "   - their name and best callback number\n" +
      "   - what the appointment is for\n" +
      "   - their preferred date and time, offering 2-3 open options if they're unsure\n" +
      "3. For a reschedule or cancellation, first confirm which existing appointment they mean.\n" +
      "4. Ask ONE question at a time. Never stack questions.\n" +
      "5. Read back the final date, time, and details, and confirm it out loud.\n" +
      "6. Close by telling them how they'll be reminded (call, text, or email) and say goodbye.",
    voice: "organized, courteous, and precise — a dependable office coordinator",
  },
  {
    key: "support",
    label: "AI Support",
    blurb: "Troubleshoots customer issues and logs tickets when it can't resolve them live.",
    persona:
      "You are a customer support agent for the business. You are patient, empathetic, " +
      "and clear. You sound like a seasoned support rep who genuinely wants to solve " +
      "the customer's problem, not just close the ticket.",
    prompt:
      "Your job is to help a customer resolve an issue through natural conversation.\n\n" +
      "Run it in this order:\n" +
      "1. Greet briefly and ask what's going on.\n" +
      "2. Ask ONE clarifying question at a time until you understand:\n" +
      "   - what they were trying to do\n" +
      "   - what happened instead\n" +
      "   - when it started and how often it happens\n" +
      "3. If you know a fix or workaround, walk them through it one step at a time and " +
      "confirm it worked.\n" +
      "4. If you can't resolve it live, log a clear summary as a ticket and set expectations " +
      "for follow-up.\n" +
      "5. Reflect back what you heard and confirm it's accurate.\n" +
      "6. Close with clear next steps and a warm goodbye.",
    voice: "patient, empathetic, and clear — a seasoned support rep",
  },
  {
    key: "chat",
    label: "Chat AI",
    blurb: "A general-purpose text chat assistant for quick questions and conversation.",
    persona:
      "You are a helpful chat assistant for the business. You are conversational, " +
      "concise, and easy to talk to. You sound like a knowledgeable teammate " +
      "answering over chat, not a call center script.",
    prompt:
      "Your job is to have a natural back-and-forth text conversation and help with " +
      "whatever the visitor needs.\n\n" +
      "Run it in this order:\n" +
      "1. Greet briefly and ask what they need help with.\n" +
      "2. Ask ONE clarifying question at a time to understand their request before answering.\n" +
      "3. Give clear, direct answers. Keep messages short — this is chat, not an essay.\n" +
      "4. If the request needs a human or falls outside what you know, say so plainly and " +
      "offer the best next step.\n" +
      "5. Close naturally once their question is resolved; don't force a scripted ending.",
    voice: "conversational, concise, and easy to talk to",
  },
];

const VOICE_BLOCK_RE = /\n\nVOICE:\n[\s\S]*$/;

function foldVoice(prompt: string, voice: string) {
  const base = prompt.replace(VOICE_BLOCK_RE, "");
  const v = (voice || "").trim();
  if (!v) return base;
  return base.replace(/\s+$/, "") + "\n\nVOICE:\n- " + v;
}

type PlaygroundState = { persona: string; voice: string; prompt: string };

function scope(email?: string | null) {
  return email || "guest";
}

// The original single-agent playground stored its state under
// "bsl_playground" with no type suffix — keep that exact key for the
// "onboarding" type so existing customizations aren't orphaned.
function storageKeyFor(type: AgentTypeKey, email?: string | null) {
  return type === "onboarding"
    ? scopedKey("bsl_playground", scope(email))
    : scopedKey(`bsl_playground_${type}`, scope(email));
}

function activeTypeStorageKey(email?: string | null) {
  return scopedKey("bsl_playground_active_type", scope(email));
}

function defFor(type: AgentTypeKey) {
  return AGENT_TYPES.find((t) => t.key === type) ?? AGENT_TYPES[1];
}

function loadState(type: AgentTypeKey, email?: string | null): PlaygroundState {
  const def = defFor(type);
  const stored = getJSON<Partial<PlaygroundState>>(storageKeyFor(type, email));
  return {
    persona: stored?.persona ?? def.persona,
    voice: stored?.voice ?? def.voice,
    prompt: stored?.prompt ?? foldVoice(def.prompt, def.voice),
  };
}

export default function PlaygroundPage() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { syncCreditsFromServer } = useCredits();
  const toast = useToast();
  const [supabase] = useState(() => createClient());

  const [activeType, setActiveType] = useState<AgentTypeKey>(() => {
    const stored = getJSON<AgentTypeKey>(activeTypeStorageKey(user?.email));
    return stored && AGENT_TYPES.some((t) => t.key === stored) ? stored : "onboarding";
  });
  const [state, setState] = useState<PlaygroundState>(() => loadState(activeType, user?.email));
  const [change, setChange] = useState("");
  const [rewriting, setRewriting] = useState(false);

  const activeDef = defFor(activeType);

  function handleSelectType(type: AgentTypeKey) {
    if (type === activeType) return;
    setActiveType(type);
    setJSON(activeTypeStorageKey(user?.email), type);
    setState(loadState(type, user?.email));
    setChange("");
  }

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
    setJSON(storageKeyFor(activeType, user?.email), next);
    logActivity("system", `Updated the ${activeDef.label} prompt in the playground`);
    toast("Prompt saved", true);
  }

  function handleReset() {
    if (!confirm(`Reset the voice, persona and prompt for ${activeDef.label} to the defaults?`)) return;
    const next = {
      voice: activeDef.voice,
      persona: activeDef.persona,
      prompt: foldVoice(activeDef.prompt, activeDef.voice),
    };
    setState(next);
    setJSON(storageKeyFor(activeType, user?.email), next);
    toast("Restored the default prompt", true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Prompt playground</h2>
          <p className="page-sub">Choose what kind of AI you want in your onboarding flow, then describe how it should behave in plain English and it rewrites the prompt for you — no need to touch the system prompt.</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <span className="pp-label">Choose your AI</span>
        <div className="plan-pills">
          {AGENT_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`plan-pill${activeType === t.key ? " active" : ""}`}
              onClick={() => handleSelectType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="panel-sub" style={{ marginTop: 10, marginBottom: 0 }}>{activeDef.blurb}</p>
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
            <span className="pp-label">{activeDef.label} prompt</span>
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

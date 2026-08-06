/* The default onboarding-agent definition — formerly the Playground's
   hardcoded ONBOARDING_AGENT literal. New assistants created from the
   Assistants tab start from this, and the localStorage → Supabase
   migration falls back to it for fields the old Playground never had
   (name, first_message). */

export const DEFAULT_ASSISTANT = {
  name: "Onboarding agent",
  blurb: "Onboards new clients through a natural conversation, not a form.",
  first_message: "Hey! Great to have you here. Before we build anything, I'd love to understand your business — what would you like to use this for?",
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
};

/* Pre-made starting points for the "New assistant" picker. The
   question flow is deliberately identical across industries — the
   [INDUSTRY] token is the only thing that changes, swapped in by
   applyIndustry() before the row is inserted. DEFAULT_ASSISTANT
   stays untouched above: the legacy-Playground migration and field
   fallbacks still read it. */

export const INDUSTRY_TOKEN = "[INDUSTRY]";

export type AssistantTemplate = {
  id: string;
  label: string;
  blurb: string;
  defaultIndustry: string;
  first_message: string;
  persona: string;
  prompt: string;
  voice: string;
};

export function applyIndustry(tpl: AssistantTemplate, industry: string) {
  const ind = industry.trim() || tpl.defaultIndustry;
  const swap = (s: string) => s.split(INDUSTRY_TOKEN).join(ind);
  return {
    first_message: swap(tpl.first_message),
    persona: swap(tpl.persona),
    prompt: swap(tpl.prompt),
    voice: tpl.voice,
  };
}

export const ASSISTANT_TEMPLATES: AssistantTemplate[] = [
  {
    id: "saas-client-onboarding",
    label: "Client onboarding · SaaS",
    blurb: "Onboards a newly signed client — offer, ICP, goals and brand voice — through a natural conversation.",
    defaultIndustry: "SaaS",
    first_message:
      "Welcome aboard! Great to have you with us. Before we set anything up, I'd love to understand your business — what does your company do?",
    persona:
      "You are the client-onboarding specialist for a [INDUSTRY] company. " +
      "You onboard newly signed customers so the team can deliver from day " +
      "one. You are warm, direct, and plain-spoken. No hype, no jargon. You " +
      "sound like a sharp customer-success lead who respects the client's time.",
    prompt:
      "Your job is to onboard a newly signed [INDUSTRY] client through a natural CONVERSATION, never a form.\n\n" +
      "Run it in this order:\n" +
      "1. Greet briefly, then ask ONE question: their business and what they do.\n" +
      "2. Collect what matters, one question at a time:\n" +
      "   - their main offer and how it's priced\n" +
      "   - their ideal customer (ICP) and target market\n" +
      "   - their #1 goal for the next 90 days\n" +
      "   - their brand voice — how they want to sound to customers\n" +
      "   - the tools they use today and where things get stuck\n" +
      "3. Ask ONE question at a time. Never stack questions.\n" +
      "4. Reflect back what you heard in plain words and confirm it.\n" +
      "5. Close with clear next steps and a warm goodbye.",
    voice: "warm, direct, and plain-spoken — no hype, no jargon",
  },
  {
    id: "client-onboarding",
    label: "Client onboarding · universal",
    blurb: DEFAULT_ASSISTANT.blurb,
    defaultIndustry: "AI marketing systems",
    first_message: DEFAULT_ASSISTANT.first_message,
    persona:
      "You are the onboarding agent for a [INDUSTRY] company. " +
      "You are warm, direct, and plain-spoken. No hype, no jargon. You sound " +
      "like a sharp operations lead who respects the client's time.",
    prompt: DEFAULT_ASSISTANT.prompt,
    voice: DEFAULT_ASSISTANT.voice,
  },
];

/* The old Playground folded the voice into the prompt as a trailing
   "VOICE:" block AND stored it separately, and agent-talk appends voice
   again at serve time — so deployed system prompts carried it twice.
   The Assistants editor keeps voice solely in its own column; this
   strips the legacy block from prompts written by the old flow. */
export const VOICE_BLOCK_RE = /\n\nVOICE:\n[\s\S]*$/;

export function stripVoiceBlock(prompt: string): string {
  return prompt.replace(VOICE_BLOCK_RE, "").replace(/\s+$/, "");
}

/* Supabase's PostgrestError doesn't always survive an `instanceof
   Error` check (bundling realms), which turned real failures — like
   "relation does not exist" before migrations were applied — into a
   generic toast. Pull .message off anything that has one. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}

export type AssistantRow = {
  id: string;
  name: string;
  first_message: string;
  persona: string;
  prompt: string;
  voice: string;
  model: string;
  created_at: string;
  updated_at: string;
};

export type DeploymentRow = {
  id: string;
  assistant_id: string;
  slug: string;
  updated_at: string;
};

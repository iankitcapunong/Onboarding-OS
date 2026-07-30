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

/* The old Playground folded the voice into the prompt as a trailing
   "VOICE:" block AND stored it separately, and agent-talk appends voice
   again at serve time — so deployed system prompts carried it twice.
   The Assistants editor keeps voice solely in its own column; this
   strips the legacy block from prompts written by the old flow. */
export const VOICE_BLOCK_RE = /\n\nVOICE:\n[\s\S]*$/;

export function stripVoiceBlock(prompt: string): string {
  return prompt.replace(VOICE_BLOCK_RE, "").replace(/\s+$/, "");
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

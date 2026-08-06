export type CapturedFields = {
  business?: string;
  offer?: string;
  audience?: string;
  goal?: string;
  voice?: string;
};

export type AssetType = "Email copy" | "Ad copy" | "SMS copy" | "Landing page copy" | "Website";

/* spintax: {option A|option B} picks one variant per spin. Braces
   without a pipe (merge fields like {first name}) are kept. */
const SPINTAX_RE = /\{([^{}]*\|[^{}]*)\}/g;

export function hasSpintax(text: string) {
  SPINTAX_RE.lastIndex = 0;
  return SPINTAX_RE.test(String(text || ""));
}

export function spinText(text: string) {
  let out = String(text || "");
  let guard = 0;
  while (hasSpintax(out) && guard++ < 50) {
    out = out.replace(SPINTAX_RE, (_m, body: string) => {
      const opts = body.split("|");
      return opts[Math.floor(Math.random() * opts.length)];
    });
  }
  return out;
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* copy templates, filled from the call capture — ported 1:1 from
   js/app.js's buildContent(). */
export function buildContent(type: Exclude<AssetType, "Website">, c: CapturedFields): string {
  const biz = (c.business || "Your business").trim();
  const offer = (c.offer || "your core offer").trim();
  const aud = (c.audience || "your ideal clients").trim();
  const goal = (c.goal || "grow your business").trim();
  const voice = (c.voice || "clear, friendly").trim();

  if (type === "Email copy") {
    return [
      `# Email copy · ${biz}`,
      `Welcome + nurture sequence · Voice: ${voice} · Spintax enabled`,
      "",
      "## Email 1 · Welcome",
      `Subject: {Welcome to ${biz}: here's what happens next|You're in: your ${biz} quick-start|Welcome aboard: your first step with ${biz}}`,
      "Preview: {You're in. Here's your quick-start.|The essentials, in under a minute.|Start here. It takes two minutes.}",
      "",
      "{Hi|Hey|Hello} {first name},",
      "",
      `{Thanks|Thank you} for connecting with ${biz}. If you're ${aud}, you're exactly who ${offer} was built for.`,
      "",
      `Over the next few days we'll send {two short emails|a couple of quick emails} to help you ${goal}.`,
      "",
      "{Talk soon|Speak soon|More soon},",
      `The ${biz} team`,
      "",
      "## Email 2 · Value",
      "Subject: {The mistake we see most often|The #1 thing slowing you down|Why most people stall (and the fix)}",
      "",
      "{Most people|Most businesses} try to fix everything at once and stall.",
      "",
      `${cap(offer)} focuses on one outcome: helping you ${goal}.`,
      "",
      "{Reply and tell us where you're stuck.|Hit reply and tell us your biggest blocker.} We read every reply.",
      "",
      "## Email 3 · Invitation",
      "Subject: {Ready when you are|Your next step takes two minutes|The door's open}",
      "",
      `You've seen what ${biz} is about. If you're {serious about|committed to} ${goal}, the next step takes two minutes:`,
      "",
      "- Book your free consult call",
      "",
      "The call covers your goals and what's in the way. {You decide the next step.|No pressure: you decide the next step.}",
    ].join("\n");
  }

  if (type === "Ad copy") {
    return [
      `# Ad copy · ${biz}`,
      `Hooks + variations per platform · Voice: ${voice} · Spintax enabled`,
      "",
      "## Hooks",
      `- "{Still putting off|Still struggling to|Tired of postponing} ${goal}? Read this."`,
      `- "${cap(aud)}, this one's for you."`,
      `- "The {90-day|no-guesswork|step-by-step} plan to ${goal}"`,
      "",
      "## Facebook / Instagram",
      `Primary text: ${biz} helps ${aud} ${goal} with ${offer}. {You get a proven process and support from a real person.|A proven process, a real person in your corner.|No guesswork: a proven process with real support.}`,
      `Headline: ${cap(offer)} for ${aud}`,
      "CTA: {Learn More|Get Started|Book Now}",
      "",
      "## Google Search",
      `Headline 1: ${biz}`,
      `Headline 2: ${cap(offer)}`,
      `Headline 3: {Built for|Made for|Trusted by} ${aud}`,
      `Description: {Ready to|Serious about} ${goal}? Book a free consult with ${biz} in under two minutes.`,
      "",
      "## Short-form video (TikTok / Reels)",
      `Opening line: "{Nobody tells ${aud} this…|Here's what ${aud} never hear…|If you're one of ${aud}, stop scrolling.}"`,
      `Beat 1: The problem. Why ${goal} feels out of reach.`,
      `Beat 2: The shift. What changes with ${offer}.`,
      `CTA: "{Tap the link|Hit the link|Tap below} to see how ${biz} can help."`,
    ].join("\n");
  }

  if (type === "SMS copy") {
    return [
      `# SMS copy · ${biz}`,
      `Welcome, follow-up & booking texts · Voice: ${voice} · Spintax enabled`,
      "",
      "## SMS 1 · Welcome",
      `{Hi|Hey} {first name}, it's ${biz}. {Great to have you|Glad you're here}. If you're ${aud}, ${offer} was built for you. Reply YES and we'll send your next step.`,
      "",
      "## SMS 2 · Value",
      `{Quick one|Quick tip}, {first name}: most people stall on ${goal} by trying to fix everything at once. ${cap(offer)} focuses on the one thing that moves it. {Want the details?|Want a look?} Reply INFO.`,
      "",
      "## SMS 3 · Booking",
      `{first name}, your free consult with ${biz} takes 20 minutes and you leave with next steps either way. {Grab a time here|Pick a time that suits}: {booking link}`,
      "",
      "## SMS 4 · Reminder",
      `{Friendly nudge|Quick reminder}, {first name}: your call with ${biz} is coming up. Reply C to confirm or R to reschedule. {See you soon.|Talk soon.}`,
      "",
      "## SMS 5 · Re-engagement",
      `{Still thinking it over|Been a while}, {first name}? ${cap(goal)} doesn't have to wait. The door's open when you're ready: {booking link}. Reply STOP to opt out.`,
    ].join("\n");
  }

  /* Landing page copy */
  return [
    `# Landing page copy · ${biz}`,
    `Hero, sections & CTA · Voice: ${voice} · Spintax enabled`,
    "",
    "## Hero",
    `Headline: {The simpler way to|The shortcut to|A clearer path to} ${goal}`,
    `Subheadline: ${biz} gives ${aud} ${offer}, with a clear plan to ${goal}.`,
    "Primary CTA: {Book a free consult|Get your free consult|Claim your free consult}",
    "Secondary CTA: See how it works",
    "",
    "## Problem",
    "Heading: {Doing it alone is the slow way|Going it alone costs you months|The DIY route is the long route}",
    `Body: You've tried piecing it together yourself. ${biz} turns months of trial and error into a plan you can run this week.`,
    "",
    "## How it works",
    "- Step 1 · Tell us where you are. A short call to map your situation and goals.",
    `- Step 2 · Get your plan: ${offer}, tailored to you.`,
    `- Step 3 · ${cap(goal)}, with our team alongside you.`,
    "",
    "## Social proof",
    "Heading: {People like you, results like these|Real clients, real results|Don't take our word for it}",
    "Body: {Insert 2 to 3 short client quotes with names and outcomes.}",
    "",
    "## Final CTA",
    `Heading: Ready to ${goal}?`,
    "Body: The first call is free and takes 20 minutes. {You leave with next steps, whether or not we work together.|Either way, you walk away with a clear next step.}",
    "Button: {Book my free consult|Get my free consult|Start with a free consult}",
  ].join("\n");
}

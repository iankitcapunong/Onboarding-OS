import { spinText } from "./assetTemplates";
import type { CapturedFields } from "./assetTemplates";

/* Direct replacement for js/app.js's SOCIAL STUDIO section (lines
   2186-2765): platform post generation from spintax templates, the
   shuffle-bag variant picker, hashtag pools and the scheduling-slot
   finder. Ported verbatim — this is calibrated copy/product logic, not
   reimplemented. */

export type SocialPlatform = "Facebook" | "Instagram" | "LinkedIn" | "X" | "TikTok";

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["Facebook", "Instagram", "LinkedIn", "X", "TikTok"];

export type SocialCtx = {
  business: string;
  offer: string;
  audience: string;
  goal: string;
  voice: string;
  fromCall: boolean;
};

export type SocialMediaMeta = { name: string; type: string };

export type SocialItem = {
  id: string;
  platform: SocialPlatform;
  session: string;
  ts: number;
  caption: string;
  hashtags: string;
  media: SocialMediaMeta | null;
  scheduled: string | null;
};

/* ctx resolution: a live call capture takes priority over active client
   memory, matching the original's socialCtx() = latestCallContext() ||
   memoryActiveClient() || {} — the caller resolves which raw source to
   pass in (getJSON(bsl_last_call) vs useMemory()'s activeClient). */
export function resolveSocialCtx(raw: CapturedFields | null | undefined): SocialCtx {
  const c = raw || {};
  function pick(k: keyof CapturedFields, fb: string) {
    return (c[k] || "").trim() || fb;
  }
  return {
    business: pick("business", "your business"),
    offer: pick("offer", "what you sell"),
    audience: pick("audience", "your ideal clients"),
    goal: pick("goal", "get more clients"),
    voice: pick("voice", "friendly and confident"),
    fromCall: !!(c.business || "").trim(),
  };
}

export function socialFullText(item: Pick<SocialItem, "caption" | "hashtags">) {
  const base = item.caption != null ? item.caption : "";
  const tags = (item.hashtags || "").trim();
  if (!tags) return base;
  return (base ? base + "\n\n" : "") + tags;
}

/* shuffle-bag picker: draws every variant once before any repeats, and
   nudges away from repeating the previous pick right after a reshuffle —
   keeps repeated "Generate posts" clicks from producing near-identical
   wording for the same platform. Module-scoped (not React state) since
   it tracks ambient "which wording have we already shown this session"
   state that shouldn't survive a reload and never drives a render —
   ported verbatim from js/app.js's pickVariant(). */
const socialVariantPool: Record<string, number[]> = {};
const socialLastPick: Record<string, number> = {};

export function pickVariant<T>(key: string, arr: T[]): T {
  if (!socialVariantPool[key] || !socialVariantPool[key].length) {
    const idxs = arr.map((_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = idxs[i];
      idxs[i] = idxs[j];
      idxs[j] = t;
    }
    if (idxs.length > 1 && socialLastPick[key] === idxs[idxs.length - 1]) {
      const swapWith = Math.floor(Math.random() * (idxs.length - 1));
      const tmp = idxs[idxs.length - 1];
      idxs[idxs.length - 1] = idxs[swapWith];
      idxs[swapWith] = tmp;
    }
    socialVariantPool[key] = idxs;
  }
  const idx = socialVariantPool[key].pop() as number;
  socialLastPick[key] = idx;
  return arr[idx];
}

type Template = (c: SocialCtx) => string;

export const SOCIAL_TEMPLATES: Record<SocialPlatform, Template[]> = {
  Facebook: [
    (c) =>
      spinText("{Still|Tired of} losing hours onboarding every new client by hand?") + "\n\n" +
      c.business + " helps " + c.audience + " with " + c.offer + ".\n\n" +
      spinText("{Here's the thing|The truth is}") + " — most " + c.audience + " wait too long to fix this.\n\n" +
      spinText("{Send us a message|Comment START|Book a spot}") + " and we'll show you how to " + c.goal + ".",
    (c) =>
      spinText("{Quick question|Serious question}") + " for " + c.audience + ": what's actually stopping you from " + c.goal + " right now?\n\n" +
      "For a lot of the people we work with, it's " + c.offer + " — or the lack of it.\n\n" +
      c.business + " fixes that, " + spinText("{full stop|no fluff}") + ".\n\n" +
      spinText("{Drop a comment|DM us|Book a call}") + " and let's talk about your setup.",
    (c) =>
      spinText("{True story|Real example}") + ": a client came to us wanting to " + c.goal + " and had no idea where to start with " + c.offer + ".\n\n" +
      "A few weeks with " + c.business + " later, things looked completely different for " + c.audience + " like them.\n\n" +
      spinText("{Want the same result?|Ready for that?}") + " " + spinText("{Message us|Comment below}") + " and we'll map it out for you.",
    (c) =>
      spinText("{Myth|Misconception}") + ": " + c.audience + " don't need help with " + c.offer + ".\n\n" +
      spinText("{Reality|Truth}") + ": the ones who grow fastest are the ones who get this right early.\n\n" +
      c.business + " makes it simple to " + c.goal + ".\n\n" +
      spinText("{Ready to fix it?|Want in?}") + " " + spinText("{Send a message|Comment YES}") + " and we'll get you started.",
    (c) =>
      c.business + " helps " + c.audience + " " + c.goal + " through " + c.offer + ".\n\n" +
      spinText("{No fluff|Straight to the point}") + " — if that sounds like what you need, " + spinText("{let's talk|reach out|book a call}") + ".\n\n" +
      spinText("{Comment below|Send a DM}") + " to get started.",
  ],
  Instagram: [
    (c) =>
      c.business + " helps " + c.audience + " with " + c.offer + ".\n\n" +
      spinText("{Save this post|Tag someone who needs this}") + " 📌\n\n" +
      spinText("{Send us a message|Comment START|Book a spot}") + " and we'll show you how to " + c.goal + ".",
    (c) =>
      spinText("{POV|Real talk}") + ": you're " + c.audience + " and " + c.goal + " feels further away than it should.\n\n" +
      c.offer + " from " + c.business + " changes that.\n\n" +
      spinText("{Drop a 🙋|Comment YES}") + " if you're ready.",
    (c) =>
      "3 signs you need " + c.offer + ":\n\n" +
      "→ You're " + c.audience + " juggling too much\n" +
      "→ " + c.goal + " keeps getting pushed back\n" +
      "→ You know something has to change\n\n" +
      c.business + " is that change. " + spinText("{DM us|Comment below}") + ".",
    (c) =>
      spinText("{Behind the scenes|Fun fact}") + ": " + c.business + " exists to help " + c.audience + " " + c.goal + " without the usual headache of " + c.offer + ".\n\n" +
      spinText("{Save for later|Share with a friend}") + " 🔖",
    (c) =>
      spinText("{This is your sign|Consider this your sign}") + " to finally sort out " + c.offer + ".\n\n" +
      c.business + " makes " + c.goal + " simple for " + c.audience + ".\n\n" +
      spinText("{Comment START|Send a DM}") + " and let's go.",
  ],
  LinkedIn: [
    (c) =>
      "Most " + c.audience + " underestimate what " + c.offer + " changes.\n\n" +
      c.business + " helps " + c.audience + " with " + c.offer + ".\n\n" +
      "The result our clients care about: " + c.goal + ".\n\n" +
      spinText("{Agree?|Seen this too?}") + " Let's talk in the comments.",
    (c) =>
      spinText("{Unpopular opinion|Observation}") + ": " + c.offer + " is still treated as a nice-to-have by too many " + c.audience + ".\n\n" +
      "At " + c.business + ", we see it differently — it's the difference between stalling and " + c.goal + ".\n\n" +
      "Curious how others are approaching this.",
    (c) =>
      "A pattern we keep seeing with " + c.audience + ":\n\n" +
      "→ " + c.goal + " stays a goal, not a result\n" +
      "→ " + c.offer + " gets deprioritized\n" +
      "→ Growth plateaus\n\n" +
      c.business + " was built to break that pattern. Thoughts?",
    (c) =>
      spinText("{Case in point|Example}") + ": one of our clients — " + c.audience + " like many of you — needed " + c.offer + " and didn't know where to start.\n\n" +
      "Working with " + c.business + ", " + c.goal + " stopped being a someday project.\n\n" +
      "Happy to share what worked in the comments.",
    (c) =>
      "If you're " + c.audience + " and " + c.goal + " has stalled, " + c.offer + " is usually the missing piece.\n\n" +
      c.business + " specializes in exactly that.\n\n" +
      spinText("{Open to a conversation?|Worth a chat?}") + " Send a message.",
  ],
  X: [
    (c) => spinText("{Hot take|Reminder}") + ": " + c.audience + " don't need more tools — they need " + c.offer + ".\n\n" + c.business + " → " + c.goal + ".",
    (c) => spinText("{Unpopular truth|Fact}") + ": " + c.goal + " is easier than most " + c.audience + " think.\n\nAll it takes is " + c.offer + ".\n\n" + c.business + " builds that.",
    (c) => c.audience + ", quick one:\n\nIf " + c.offer + " isn't sorted, " + c.goal + " will keep slipping.\n\n" + c.business + " fixes that.",
    (c) => spinText("{PSA|Reminder}") + ": " + c.business + " helps " + c.audience + " " + c.goal + " through " + c.offer + ". That's it. That's the tweet.",
    (c) => "The gap between " + c.audience + " who " + c.goal + " and those who don't?\n\n" + c.offer + ".\n\n" + c.business + " closes it.",
  ],
  TikTok: [
    (c) =>
      "HOOK (first 2s): \"" + spinText("{Still|Tired of}") + " losing hours onboarding every new client by hand?\"\n" +
      "BODY: show how " + c.business + " delivers " + c.offer + " for " + c.audience + ".\n" +
      "CTA: \"" + spinText("{Send us a message|Comment START|Book a spot}") + " and we'll show you how to " + c.goal + ".\"\n" +
      "CAPTION: " + c.business + " helps " + c.audience + " with " + c.offer + ".",
    (c) =>
      "HOOK (first 2s): \"" + spinText("{Nobody tells you this about|Here's what nobody says about}") + " " + c.offer + "\"\n" +
      "BODY: walk through how " + c.audience + " usually get stuck, then how " + c.business + " changes it.\n" +
      "CTA: \"" + spinText("{Follow for more|Comment YES}") + " if you want the full breakdown.\"\n" +
      "CAPTION: " + c.business + " helps " + c.audience + " " + c.goal + ".",
    (c) =>
      "HOOK (first 2s): \"3 signs you need " + c.offer + "\"\n" +
      "BODY: list the 3 signs, then show " + c.business + " solving it for " + c.audience + ".\n" +
      "CTA: \"" + spinText("{Save this|Send this to a friend}") + " who needs to see it.\"\n" +
      "CAPTION: " + spinText("{This is your sign|Consider this your sign}") + " to fix " + c.offer + ".",
    (c) =>
      "HOOK (first 2s): \"" + spinText("{POV|Real talk}") + ": you're " + c.audience + " and " + c.goal + " keeps slipping\"\n" +
      "BODY: show the before/after with " + c.business + " handling " + c.offer + ".\n" +
      "CTA: \"" + spinText("{Comment START|DM us}") + " to get started.\"\n" +
      "CAPTION: " + c.business + " makes " + c.goal + " simple.",
  ],
};

export const SOCIAL_TAG_POOLS: Partial<Record<SocialPlatform, string[][]>> = {
  Instagram: [
    ["#smallbusiness", "#growth", "#entrepreneur"],
    ["#businessgrowth", "#clientexperience", "#worksmarter"],
    ["#scaleup", "#automation", "#businesstips"],
    ["#foundermode", "#growthhacking", "#clientonboarding"],
  ],
  TikTok: [
    ["#fyp", "#smallbusiness", "#entrepreneur"],
    ["#fyp", "#businesstips", "#growth"],
    ["#fyp", "#foundertok", "#automation"],
  ],
};

export function socialBrandTag(c: SocialCtx) {
  const slug = (c.business || "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
  return slug ? "#" + slug : "";
}

export function socialHashtags(platform: SocialPlatform, c: SocialCtx) {
  const pool = SOCIAL_TAG_POOLS[platform];
  if (!pool) return "";
  let tags = pickVariant(platform + ":tags", pool).slice();
  const brand = socialBrandTag(c);
  if (brand) tags = [brand, ...tags];
  return tags.join(" ");
}

/* returns {caption, hashtags} so drafts start with the two split apart —
   matches how the edit form and the row display treat them */
export function socialPost(platform: SocialPlatform, c: SocialCtx): { caption: string; hashtags: string } {
  const variants = SOCIAL_TEMPLATES[platform];
  const caption =
    variants && variants.length
      ? pickVariant(platform, variants)(c)
      : c.business + " helps " + c.audience + " with " + c.offer + ".\n\n" +
        spinText("{Send us a message|Comment START|Book a spot}") + " and we'll show you how to " + c.goal + ".";
  return { caption, hashtags: socialHashtags(platform, c) };
}

/* next free publishing slot: 9:00 / 18:00, spread across coming days */
export function socialNextSlot(items: SocialItem[]): string {
  const taken: Record<string, boolean> = {};
  items.forEach((p) => {
    if (p.scheduled) taken[p.scheduled] = true;
  });
  for (let day = 0; day < 30; day++) {
    const hours = [9, 18];
    for (let s = 0; s < hours.length; s++) {
      const t = new Date();
      t.setDate(t.getDate() + day);
      t.setHours(hours[s], 0, 0, 0);
      if (t <= new Date()) continue;
      if (!taken[t.toISOString()]) return t.toISOString();
    }
  }
  return new Date(Date.now() + 86400000).toISOString();
}

export function socialWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

import type { CapturedFields } from "./assetTemplates";

/* Direct replacement for js/app.js's CREATIVE ADS section (lines
   2768-3857): a client-side HTML-template generation engine. It builds
   complete standalone HTML documents (landing pages, funnels, ad-graphics
   mockups, full websites) from onboarding-call/memory context, with a
   rotating theme system and anti-repeat layout-variant logic. No LLM
   call — pure template composition, ported verbatim (values/copy/markup
   unchanged) since this is calibrated design + copy data, not logic to
   reimplement.

   NOTE: buildWebsiteHTML is also needed by the Assets route's currently
   disabled "Website" asset-type checkbox (see src/app/app/assets/page.tsx
   and src/hooks/useAssets.tsx) — a future task should wire it in there.
   That is explicitly OUT of scope for this module/task. */

export type CreativeFields = {
  business: string;
  offer: string;
  audience: string;
  goal: string;
  voice: string;
};

export type CreativeCtx = CreativeFields & {
  _fromCall: boolean;
  _fromMemory: boolean;
};

export const DEMO_CTX: CreativeFields = {
  business: "Rivera Real Estate",
  offer: "full-service home buying & selling",
  audience: "first-time home buyers",
  goal: "generate qualified listing leads",
  voice: "professional and friendly",
};

/* ctx resolution: a live call capture takes priority over active client
   memory, per field, falling back to DEMO_CTX — matching the original's
   creativeCtx(). The caller resolves which raw sources to pass in
   (getJSON(bsl_last_call) vs useMemory()'s activeClient), same priority
   as socialCtx() in the Social Studio feature. */
export function resolveCreativeCtx(
  live: CapturedFields | null | undefined,
  mem: CapturedFields | null | undefined
): CreativeCtx {
  const c = {} as CreativeFields;
  (Object.keys(DEMO_CTX) as (keyof CreativeFields)[]).forEach((k) => {
    let v: string | null = live && (live[k] || "").trim() ? (live[k] as string).trim() : null;
    if (!v && mem && (mem[k] || "").trim()) v = (mem[k] as string).trim();
    c[k] = v || DEMO_CTX[k];
  });
  return {
    ...c,
    _fromCall: !!live,
    _fromMemory: !live && !!mem,
  };
}

export function escHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch];
  });
}

/* Design system per ui-ux-pro-max: Sora display + Inter body, semantic
   color tokens, 8px spacing rhythm, single primary CTA, SVG icons, AA
   contrast, reduced-motion support. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* curated stock photos (Unsplash CDN, auto-format/WebP). Hero/about
   vary per business name so each client gets a different look */
const STOCK = {
  hero: ["1521737711867-e3b97375f902", "1600880292203-757bb62b4baf", "1556761175-b413da4baf72", "1542744173-8e7e53415bb0", "1552664730-d307ca884978"],
  about: ["1522202176988-66273c2fd55f", "1531973576160-7125cd663d86", "1497366216548-37526070297c"],
  stages: ["1460925895917-afdab827c52f", "1498050108023-c5249f4df085", "1423666639041-f56000c27a9a", "1521791136064-7986c2920216", "1533227268428-f9ed0900fb3b"],
  avatars: ["women/44", "men/32", "women/68", "men/75", "women/12", "men/41"],
};

export function unsplash(id: string, w: number): string {
  return "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=" + w + "&q=80";
}

export function pickPhoto(seed: string, arr: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

export function avatarImg(i: number, size: number): string {
  return "<img class='avp' src='https://randomuser.me/api/portraits/" + STOCK.avatars[i % STOCK.avatars.length] + ".jpg' alt='' width='" + size + "' height='" + size + "' loading='lazy'>";
}

/* ---- theme engine: every generation gets a distinct design ---- */
export type ThemeVars = {
  primary: string; accent: string; btnFg: string; ink: string; ink2: string; ink3: string; muted: string;
  bg: string; surface: string; soft: string; border: string; navy: string;
  grad: string; grad2: string; navBg: string; btnR: string; rMd: string; rLg: string; heroBg: string;
};

export type Theme = {
  key: string;
  fonts: string;
  df: string;
  bf: string;
  v: ThemeVars;
};

export const THEMES: Theme[] = [
  {
    key: "Aurora", fonts: "Sora:wght@600;700;800&family=Inter:wght@400;500;600;700",
    df: "'Sora','Inter',sans-serif", bf: "'Inter',system-ui,sans-serif",
    v: {
      primary: "#4f46e5", accent: "#7c3aed", btnFg: "#ffffff", ink: "#0f172a", ink2: "#334155", ink3: "#64748b", muted: "#94a3b8",
      bg: "#f8fafc", surface: "#ffffff", soft: "#eef2ff", border: "#e2e8f0", navy: "#0b1120",
      grad: "linear-gradient(135deg,#4f46e5,#7c3aed)", grad2: "linear-gradient(170deg,#3730a3,#7c3aed)",
      navBg: "rgba(255,255,255,.9)", btnR: "12px", rMd: "16px", rLg: "24px",
      heroBg: "radial-gradient(1100px 520px at 70% -10%,rgba(124,58,237,.18),transparent 60%),radial-gradient(900px 480px at 10% 0%,rgba(79,70,229,.14),transparent 55%),#f8fafc",
    },
  },
  {
    key: "Noir", fonts: "Playfair+Display:wght@600;700;800&family=Source+Sans+3:wght@400;500;600",
    df: "'Playfair Display',Georgia,serif", bf: "'Source Sans 3',system-ui,sans-serif",
    v: {
      primary: "#d4af37", accent: "#f0c75e", btnFg: "#181203", ink: "#faf8f3", ink2: "#d6d3cb", ink3: "#a8a49a", muted: "#6b675e",
      bg: "#0b0b10", surface: "#15151d", soft: "rgba(212,175,55,.14)", border: "rgba(255,255,255,.09)", navy: "#060609",
      grad: "linear-gradient(135deg,#e6c453,#a87e0e)", grad2: "linear-gradient(170deg,#a87e0e,#e6c453)",
      navBg: "rgba(11,11,16,.85)", btnR: "4px", rMd: "10px", rLg: "14px",
      heroBg: "radial-gradient(1000px 500px at 75% -10%,rgba(212,175,55,.16),transparent 60%),#0b0b10",
    },
  },
  {
    key: "Editorial", fonts: "DM+Serif+Display&family=DM+Sans:wght@400;500;600;700",
    df: "'DM Serif Display',Georgia,serif", bf: "'DM Sans',system-ui,sans-serif",
    v: {
      primary: "#166534", accent: "#c2410c", btnFg: "#ffffff", ink: "#1c1917", ink2: "#44403c", ink3: "#78716c", muted: "#a8a29e",
      bg: "#faf7f2", surface: "#fffdf9", soft: "#e8f2e9", border: "#e7e0d3", navy: "#1a2e1f",
      grad: "linear-gradient(135deg,#166534,#0d9488)", grad2: "linear-gradient(170deg,#c2410c,#e11d48)",
      navBg: "rgba(250,247,242,.9)", btnR: "999px", rMd: "18px", rLg: "26px",
      heroBg: "radial-gradient(1000px 500px at 80% -10%,rgba(22,101,52,.1),transparent 60%),radial-gradient(700px 400px at 5% 10%,rgba(194,65,12,.08),transparent 55%),#faf7f2",
    },
  },
  {
    key: "Neon Tech", fonts: "Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600",
    df: "'Space Grotesk',system-ui,sans-serif", bf: "'IBM Plex Sans',system-ui,sans-serif",
    v: {
      primary: "#22d3ee", accent: "#a3e635", btnFg: "#04121a", ink: "#f1f5f9", ink2: "#cbd5e1", ink3: "#94a3b8", muted: "#64748b",
      bg: "#060913", surface: "#0e1526", soft: "rgba(34,211,238,.12)", border: "rgba(148,163,184,.16)", navy: "#03060d",
      grad: "linear-gradient(135deg,#22d3ee,#a3e635)", grad2: "linear-gradient(170deg,#0ea5e9,#22d3ee)",
      navBg: "rgba(6,9,19,.85)", btnR: "8px", rMd: "12px", rLg: "18px",
      heroBg: "radial-gradient(1000px 520px at 70% -10%,rgba(34,211,238,.14),transparent 60%),radial-gradient(700px 400px at 10% 5%,rgba(163,230,53,.1),transparent 55%),#060913",
    },
  },
  {
    key: "Sunset", fonts: "Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600",
    df: "'Outfit',system-ui,sans-serif", bf: "'Plus Jakarta Sans',system-ui,sans-serif",
    v: {
      primary: "#ea580c", accent: "#db2777", btnFg: "#ffffff", ink: "#1f1410", ink2: "#4a3b33", ink3: "#7d6b60", muted: "#a89a8f",
      bg: "#fffbf5", surface: "#ffffff", soft: "#ffefe2", border: "#f0e4d6", navy: "#2a1608",
      grad: "linear-gradient(135deg,#f97316,#db2777)", grad2: "linear-gradient(170deg,#db2777,#f97316)",
      navBg: "rgba(255,251,245,.9)", btnR: "999px", rMd: "20px", rLg: "28px",
      heroBg: "radial-gradient(1000px 520px at 75% -10%,rgba(249,115,22,.16),transparent 60%),radial-gradient(700px 420px at 5% 5%,rgba(219,39,119,.1),transparent 55%),#fffbf5",
    },
  },
  {
    key: "Ocean", fonts: "Bricolage+Grotesque:wght@600;700;800&family=Inter:wght@400;500;600",
    df: "'Bricolage Grotesque','Inter',sans-serif", bf: "'Inter',system-ui,sans-serif",
    v: {
      primary: "#0369a1", accent: "#0d9488", btnFg: "#ffffff", ink: "#0c1a24", ink2: "#334e5c", ink3: "#5e7987", muted: "#93aab5",
      bg: "#f2f9fc", surface: "#ffffff", soft: "#e0f2fe", border: "#d8e8f0", navy: "#082130",
      grad: "linear-gradient(135deg,#0369a1,#0d9488)", grad2: "linear-gradient(170deg,#075985,#0d9488)",
      navBg: "rgba(242,249,252,.9)", btnR: "14px", rMd: "16px", rLg: "24px",
      heroBg: "radial-gradient(1000px 520px at 70% -10%,rgba(13,148,136,.14),transparent 60%),radial-gradient(800px 440px at 8% 0%,rgba(3,105,161,.12),transparent 55%),#f2f9fc",
    },
  },
];

/* avoids repeating the immediately-previous theme per creative kind,
   tracked in localStorage bsl_theme_<kind>. NOT per-account scoped in
   the original (plain localStorage key, no email suffix) — preserved
   as-is, changing that would be a behavior change. */
export function pickTheme(kind: string): Theme {
  let lastKey: string | null = null;
  try {
    lastKey = window.localStorage.getItem("bsl_theme_" + kind);
  } catch {
    // storage unavailable — non-fatal, matches original try/catch guards
  }
  const pool = THEMES.filter((t) => t.key !== lastKey);
  const t = pool[Math.floor(Math.random() * pool.length)];
  try {
    window.localStorage.setItem("bsl_theme_" + kind, t.key);
  } catch {
    // storage unavailable — non-fatal
  }
  return t;
}

export function creativeShell(title: string, body: string, t: Theme): string {
  const v = t.v;
  return "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>" + title + "</title>" +
    "<link rel='preconnect' href='https://fonts.googleapis.com'>" +
    "<link href='https://fonts.googleapis.com/css2?family=" + t.fonts + "&display=swap' rel='stylesheet'>" +
    "<style>" +
    ":root{--primary:" + v.primary + ";--accent:" + v.accent + ";--btn-fg:" + v.btnFg + ";--ink:" + v.ink + ";--ink-2:" + v.ink2 + ";--ink-3:" + v.ink3 + ";--muted:" + v.muted + ";" +
    "--bg:" + v.bg + ";--surface:" + v.surface + ";--soft:" + v.soft + ";--border:" + v.border + ";--navy:" + v.navy + ";" +
    "--grad:" + v.grad + ";--grad2:" + v.grad2 + ";--nav-bg:" + v.navBg + ";--hero-bg:" + v.heroBg + ";" +
    "--btn-r:" + v.btnR + ";--r-sm:10px;--r-md:" + v.rMd + ";--r-lg:" + v.rLg + ";--shadow:0 12px 32px rgba(0,0,0,.1);--shadow-lg:0 24px 60px rgba(0,0,0,.16)}" +
    "*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth}" +
    "body{font-family:" + t.bf + ";color:var(--ink-2);background:var(--bg);line-height:1.65;font-size:16px;-webkit-font-smoothing:antialiased}" +
    "h1,h2,h3,h4{font-family:" + t.df + ";color:var(--ink);line-height:1.2;letter-spacing:-.01em}" +
    ".wrap{max-width:1080px;margin:0 auto;padding:0 24px}" +
    ".btn{display:inline-flex;align-items:center;gap:8px;background:var(--grad);color:var(--btn-fg);text-decoration:none;font-weight:600;font-size:15.5px;" +
    "padding:14px 28px;border-radius:var(--btn-r);border:none;cursor:pointer;transition:transform .2s ease,filter .2s ease;box-shadow:0 8px 24px rgba(0,0,0,.2)}" +
    ".btn:hover{filter:brightness(1.08);transform:translateY(-2px)}" +
    ".btn.plain{background:var(--surface);color:var(--ink);border:1px solid var(--border);box-shadow:none}" +
    ".btn.ghost{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);box-shadow:none;color:#fff}" +
    ".btn.light{background:var(--surface);color:var(--primary);box-shadow:0 8px 24px rgba(0,0,0,.2)}" +
    ".badge{display:inline-flex;align-items:center;gap:8px;background:var(--soft);color:var(--primary);font-weight:600;font-size:13px;padding:8px 16px;border-radius:999px}" +
    ".badge.on-dark{background:rgba(255,255,255,.14);color:#fff}" +
    ".eyebrow{font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--primary);margin-bottom:12px}" +
    ".card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:28px;box-shadow:0 1px 2px rgba(0,0,0,.05)}" +
    ".ic{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:12px;background:var(--soft);color:var(--primary);flex-shrink:0}" +
    "svg{display:block}img{max-width:100%}" +
    ".avp{width:42px;height:42px;border-radius:50%;object-fit:cover;background:var(--soft);flex-shrink:0}" +
    ".hl{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}" +
    "@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}" +
    ".rise{animation:rise .6s cubic-bezier(.16,1,.3,1) both}" +
    ".d1{animation-delay:.08s}.d2{animation-delay:.16s}.d3{animation-delay:.24s}" +
    "@media(prefers-reduced-motion:reduce){.rise{animation:none}html{scroll-behavior:auto}}" +
    "</style></head><body>" + body + "</body></html>";
}

export function creativeNav(biz: string, initial: string, links: [string, string][], ctaText: string, ctaHref?: string): string {
  return "<nav style='position:sticky;top:0;z-index:50;background:var(--nav-bg);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)'>" +
    "<div class='wrap' style='display:flex;align-items:center;justify-content:flex-end;height:68px'>" +
    "<div style='display:flex;align-items:center;gap:26px'>" +
    links.map((l) => "<a href='#" + l[1] + "' style='text-decoration:none;color:var(--ink-2);font-size:14.5px;font-weight:500'>" + l[0] + "</a>").join("") +
    "<a class='btn' style='padding:11px 20px;font-size:14px' href='#" + (ctaHref || "cta") + "'>" + ctaText + "</a>" +
    "</div></div></nav>";
}

/* ---- uniqueness engine: layout variants + anti-repeat memory ---- */
export function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* tracks up to 10 recent layout signatures per kind in localStorage
   bsl_layouts, re-rolling (up to 12 attempts) to avoid repeats. NOT
   per-account scoped in the original — preserved as-is. */
export function rollUnique<T extends { sig: string }>(kind: string, roll: () => T): T {
  const KEY = "bsl_layouts";
  let hist: Record<string, string[]>;
  try {
    hist = JSON.parse(window.localStorage.getItem(KEY) || "null") || {};
  } catch {
    hist = {};
  }
  const seen = hist[kind] || [];
  let V: T = roll();
  for (let i = 0; i < 12; i++) {
    V = roll();
    if (seen.indexOf(V.sig) === -1) break;
  }
  seen.unshift(V.sig);
  hist[kind] = seen.slice(0, 10);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(hist));
  } catch {
    // storage unavailable — non-fatal
  }
  return V;
}

export const CTA_POOL = ["Book a free consult", "Get started", "Talk to us", "Book a call"];

export function buildLandingHTML(c: CreativeFields): { html: string; theme: string } {
  const biz = escHtml(c.business), offer = escHtml(c.offer), aud = escHtml(c.audience), goal = escHtml(c.goal);
  const initial = escHtml((c.business || "B").trim().charAt(0).toUpperCase());
  const check = "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6 9 17l-5-5'/></svg>";
  const t = pickTheme("landing");
  const V = rollUnique("landing", () => {
    const v = {
      hero: rnd([0, 1, 2]), head: rnd([0, 1, 2, 3]), cta: rnd([0, 1, 2, 3]),
      ben: rnd([0, 1, 2]), steps: rnd([0, 1]), quotes: rnd([0, 1]),
      band: rnd([0, 1]), swap: rnd([0, 1]), faq: Math.random() < 0.7 ? 1 : 0,
    };
    return { ...v, sig: [t.key, v.hero, v.head, v.cta, v.ben, v.steps, v.quotes, v.band, v.swap, v.faq].join("|") };
  });

  const CTA = CTA_POOL[V.cta];
  const headline = [
    "The simpler way to <span class='hl'>" + goal + "</span>",
    "Your shortcut to <span class='hl'>" + goal + "</span>",
    "<span class='hl'>" + cap(goal) + "</span> starts here",
    "Ready to <span class='hl'>" + goal + "</span>?",
  ][V.head];
  const sub = biz + " gives " + aud + " " + offer + ", with a clear plan and support from a real person.";
  const heroPhoto = unsplash(pickPhoto(biz + t.key + V.hero, STOCK.hero), 1400);
  const statChips =
    "<div class='stats rise d3'><div class='stat'><strong>100+</strong><span>clients served</span></div>" +
    "<div class='stat'><strong>4.9★</strong><span>average rating</span></div>" +
    "<div class='stat'><strong>20 min</strong><span>to a clear plan</span></div></div>";

  let heroInner: string;
  if (V.hero === 1) {
    heroInner =
      "<div class='wrap hero-grid'>" +
      "<div style='text-align:left'>" +
      "<span class='badge rise'>" + check + " Built for " + aud + "</span>" +
      "<h1 class='rise d1' style='margin:20px 0 16px'>" + headline + "</h1>" +
      "<p class='sub rise d2' style='margin:0 0 30px'>" + sub + "</p>" +
      "<div class='hero-ctas rise d3' style='justify-content:flex-start'><a class='btn' href='#cta'>" + CTA + "</a><a class='btn plain' href='#how'>See how it works</a></div>" +
      "<p class='micro rise d3'>Free 20-minute call · Clear next steps either way</p></div>" +
      "<div class='hero-side rise d2'><img src='" + heroPhoto + "' alt='The " + biz + " team at work' width='800' height='620' style='width:100%;height:auto;aspect-ratio:4/3.1;object-fit:cover;border-radius:var(--r-lg);box-shadow:var(--shadow-lg);background:var(--soft)'>" +
      "<div class='float-card'><span class='stars'>★★★★★</span><div><strong>4.9 rating</strong><span>from 100+ clients</span></div></div></div>" +
      "</div><div class='wrap'>" + statChips + "</div>";
  } else if (V.hero === 2) {
    heroInner =
      "<div class='wrap' style='max-width:820px'>" +
      "<span class='badge rise'>" + check + " Built for " + aud + "</span>" +
      "<h1 class='rise d1' style='text-align:left;margin:20px 0 16px'>" + headline + "</h1>" +
      "<p class='sub rise d2' style='margin:0 0 30px;text-align:left'>" + sub + "</p>" +
      "<div class='hero-ctas rise d3' style='justify-content:flex-start'><a class='btn' href='#cta'>" + CTA + "</a><a class='btn plain' href='#how'>See how it works</a></div>" +
      statChips + "</div>";
  } else {
    heroInner =
      "<div class='wrap' style='text-align:center'>" +
      "<span class='badge rise'>" + check + " Built for " + aud + "</span>" +
      "<h1 class='rise d1'>" + headline + "</h1>" +
      "<p class='sub rise d2' style='margin-left:auto;margin-right:auto'>" + sub + "</p>" +
      "<div class='hero-ctas rise d3'><a class='btn' href='#cta'>" + CTA + "</a><a class='btn plain' href='#how'>See how it works</a></div>" +
      "<p class='micro rise d3'>Free 20-minute call · Clear next steps either way</p>" +
      statChips +
      "<div class='hero-img rise d3'><img src='" + heroPhoto + "' alt='The " + biz + " team at work' width='1200' height='620' loading='lazy'>" +
      "<div class='float-card'><span class='stars'>★★★★★</span><div><strong>4.9 rating</strong><span>from 100+ clients</span></div></div></div>" +
      "</div>";
  }

  const benCards = [
    { h: "A plan you can run", p: cap(offer) + " mapped to your situation, so you know the next step.", ic: "<circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/>" },
    { h: "Momentum from week one", p: "We compress months of trial and error into the first sessions, so results show early.", ic: "<path d='M13 2 3 14h9l-1 8 10-12h-9l1-8z'/>" },
    { h: "Direct access to our team", p: "You reach the " + biz + " team at each step of the work.", ic: "<path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M23 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/>" },
  ];

  function secBenefits(): string {
    const head = "<div class='sec-head'><p class='eyebrow'>Why " + biz + "</p><h2>Doing it alone is the slow way</h2>" +
      "<p>You've tried piecing it together yourself. Here's what changes when you work with " + biz + ".</p></div>";
    if (V.ben === 1) {
      const items = [cap(offer) + " tailored to you", "A clear plan before you commit", "Direct access to our team",
        "Progress you can measure", "Built for " + aud, "Support until you " + goal];
      return "<section class='sec'><div class='wrap'>" + head + "<ul class='cklist'>" +
        items.map((it) => "<li>" + check + "<span>" + it + "</span></li>").join("") +
        "</ul></div></section>";
    }
    if (V.ben === 2) {
      return "<section class='sec'><div class='wrap'>" + head + "<div class='grid3'>" +
        benCards.map((b, i) => "<div class='numcard'><span class='ghostnum'>0" + (i + 1) + "</span><h3>" + b.h + "</h3><p>" + b.p + "</p></div>").join("") + "</div></div></section>";
    }
    return "<section class='sec'><div class='wrap'>" + head + "<div class='grid3'>" +
      benCards.map((b) => "<div class='card'><span class='ic'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + b.ic + "</svg></span><h3>" + b.h + "</h3><p>" + b.p + "</p></div>").join("") + "</div></div></section>";
  }

  const stepData = [
    { h: "Tell us where you are", p: "A short call to map your situation and goals." },
    { h: "Get your plan", p: cap(offer) + ", tailored to you and ready to act on." },
    { h: cap(goal), p: "Execute with the " + biz + " team alongside you." },
  ];

  function secSteps(): string {
    const head = "<div class='sec-head'><p class='eyebrow'>How it works</p><h2>Three steps to " + goal + "</h2></div>";
    if (V.steps === 1) {
      return "<section class='sec' id='how' style='background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)'><div class='wrap' style='max-width:680px'>" + head +
        "<div class='timeline'>" +
        stepData.map((s, i) => "<div class='tl-item'><span class='tl-dot'>" + (i + 1) + "</span><div><h3>" + s.h + "</h3><p>" + s.p + "</p></div></div>").join("") + "</div></div></section>";
    }
    return "<section class='sec' id='how' style='background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)'><div class='wrap'>" + head +
      "<div class='grid3'>" +
      stepData.map((s, i) => "<div class='card' style='border:none;box-shadow:none;background:transparent'><span class='step-num'>" + (i + 1) + "</span><h3>" + s.h + "</h3><p>" + s.p + "</p></div>").join("") + "</div></div></section>";
  }

  const quoteData = [
    { q: "Working with " + biz + " was the easiest decision we made this year.", i: 0 },
    { q: "Our numbers moved within the first month.", i: 1 },
    { q: "Within six weeks we were on track to " + goal + ".", i: 2 },
  ];

  function secQuotes(): string {
    const head = "<div class='sec-head'><p class='eyebrow'>Results</p><h2>People like you, results like these</h2></div>";
    if (V.quotes === 1) {
      return "<section class='sec' id='results'><div class='wrap' style='max-width:700px;text-align:center'>" + head +
        "<div class='bigquote'><span class='stars'>★★★★★</span><p>“" + quoteData[0].q + "”</p>" +
        "<div class='who' style='justify-content:center'>" + avatarImg(0, 42) + "<div style='text-align:left'><strong>Add a real client</strong><span>Replace with a real quote</span></div></div></div>" +
        "</div></section>";
    }
    return "<section class='sec' id='results'><div class='wrap'>" + head + "<div class='grid3'>" +
      quoteData.map((q) => "<div class='card quotebox'><span class='stars'>★★★★★</span><p>“" + q.q + "”</p><div class='who'>" + avatarImg(q.i, 42) + "<div><strong>Add a real client</strong><span>Replace with a real quote</span></div></div></div>").join("") + "</div></div></section>";
  }

  function secCTA(): string {
    const body = "<h2>Ready to " + goal + "?</h2>" +
      "<p>The first call is free and takes 20 minutes. You leave with clear next steps, whether or not we work together.</p>" +
      "<a class='btn light' href='#'>" + CTA + "</a>" +
      "<div class='checks'><span>" + check + " Free consult</span><span>" + check + " Clear next steps</span></div>";
    if (V.band === 1) {
      return "<section class='band' id='cta'><div class='wrap' style='text-align:center'>" + body + "</div></section>";
    }
    return "<section class='sec' id='cta' style='padding-top:0'><div class='wrap'><div class='cta-panel'>" + body + "</div></div></section>";
  }

  function secFAQ(): string {
    return "<section class='sec' id='faq' style='padding-top:0'><div class='wrap' style='max-width:720px'>" +
      "<div class='sec-head'><p class='eyebrow'>FAQ</p><h2>Common questions</h2></div>" +
      "<details open><summary>Who is this for?</summary><p>" + cap(aud) + " who want to " + goal + " without wasting months figuring it out alone.</p></details>" +
      "<details><summary>What exactly do I get?</summary><p>" + cap(offer) + ", with direct support from the " + biz + " team.</p></details>" +
      "<details><summary>What happens on the free call?</summary><p>We map where you are, where you want to be, and what's in the way. You leave with next steps either way.</p></details>" +
      "</div></section>";
  }

  const navLinks: [string, string][] = [["How it works", "how"], ["Results", "results"]];
  if (V.faq) navLinks.push(["FAQ", "faq"]);

  const mid = V.swap ? secSteps() + secBenefits() : secBenefits() + secSteps();

  const html = creativeShell(biz + " · Landing page",
    "<style>" +
    ".hero{position:relative;overflow:hidden;background:var(--hero-bg);padding:88px 0 72px}" +
    ".hero h1{font-size:clamp(34px,5.2vw,58px);font-weight:800;max-width:820px;margin:22px auto 18px}" +
    ".hero .sub{font-size:19px;max-width:620px;margin:0 auto 34px;color:var(--ink-3)}" +
    ".hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:52px;align-items:center;margin-bottom:52px}" +
    "@media(max-width:860px){.hero-grid{grid-template-columns:1fr}}" +
    ".hero-side{position:relative}" +
    ".hero-ctas{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}" +
    ".micro{margin-top:14px;font-size:13.5px;color:var(--muted)}" +
    ".stats{display:flex;gap:0;justify-content:center;margin:58px auto 0;max-width:720px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow)}" +
    ".stat{flex:1;padding:22px 14px;text-align:center}.stat+.stat{border-left:1px solid var(--border)}" +
    ".stat strong{display:block;font-size:26px;color:var(--ink)}" +
    ".stat span{font-size:13px;color:var(--ink-3)}" +
    ".hero-img{position:relative;max-width:880px;margin:56px auto 30px}" +
    ".hero-img img{width:100%;height:auto;aspect-ratio:1200/620;object-fit:cover;border-radius:var(--r-lg);border:1px solid var(--border);box-shadow:var(--shadow-lg);background:var(--soft)}" +
    ".float-card{position:absolute;bottom:-24px;left:26px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:12px 18px;display:flex;gap:12px;align-items:center;text-align:left}" +
    ".float-card strong{display:block;font-size:14px;color:var(--ink)}.float-card span{font-size:12px;color:var(--muted)}" +
    ".sec{padding:84px 0}.sec-head{text-align:center;max-width:640px;margin:0 auto 48px}" +
    ".sec-head h2{font-size:clamp(26px,3.4vw,36px);margin-bottom:12px}.sec-head p{color:var(--ink-3);font-size:16.5px}" +
    ".grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px}" +
    ".card h3{font-size:18px;margin:16px 0 8px}.card p{font-size:14.5px;color:var(--ink-3)}" +
    ".cklist{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px 34px;max-width:760px;margin:0 auto}" +
    ".cklist li{display:flex;gap:12px;align-items:flex-start;font-size:15.5px;color:var(--ink-2);padding:10px 0;border-bottom:1px solid var(--border)}" +
    ".cklist svg{color:var(--primary);flex-shrink:0;margin-top:3px}" +
    ".numcard{padding:26px;border-top:3px solid var(--primary);background:var(--surface);border-radius:0 0 var(--r-md) var(--r-md);box-shadow:var(--shadow)}" +
    ".numcard .ghostnum{font-family:inherit;font-size:40px;font-weight:800;color:var(--soft);-webkit-text-stroke:1.5px var(--primary);display:block;margin-bottom:8px}" +
    ".numcard h3{font-size:18px;margin:0 0 8px}.numcard p{font-size:14.5px;color:var(--ink-3)}" +
    ".step-num{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;background:var(--grad);color:var(--btn-fg);font-weight:700;font-size:18px}" +
    ".timeline{border-left:2px solid var(--border);padding-left:0;margin-left:22px}" +
    ".tl-item{position:relative;display:flex;gap:20px;padding:0 0 34px 30px}" +
    ".tl-item:last-child{padding-bottom:0}" +
    ".tl-dot{position:absolute;left:-23px;top:0;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:var(--grad);color:var(--btn-fg);font-weight:700;box-shadow:0 0 0 5px var(--bg)}" +
    ".tl-item h3{font-size:17.5px;margin:8px 0 6px}.tl-item p{font-size:14.5px;color:var(--ink-3)}" +
    ".quotebox p{font-size:15.5px;color:var(--ink-2);margin:14px 0 18px}" +
    ".stars{color:#f59e0b;letter-spacing:2px;font-size:15px}" +
    ".bigquote{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:44px 40px;box-shadow:var(--shadow)}" +
    ".bigquote p{font-size:clamp(18px,2.4vw,24px);color:var(--ink);line-height:1.5;margin:16px 0 24px}" +
    ".who{display:flex;align-items:center;gap:12px}" +
    ".who strong{display:block;font-size:14px;color:var(--ink)}.who span{font-size:12.5px;color:var(--muted)}" +
    ".cta-panel{background:var(--grad);border-radius:var(--r-lg);padding:64px 40px;text-align:center;color:var(--btn-fg);box-shadow:var(--shadow-lg)}" +
    ".cta-panel h2{color:var(--btn-fg);font-size:clamp(26px,3.4vw,38px);margin-bottom:12px}" +
    ".cta-panel p{opacity:.92;max-width:520px;margin:0 auto 30px}" +
    ".band{background:var(--navy);color:#fff;padding:76px 0;margin-top:0}" +
    ".band h2{color:#fff;font-size:clamp(26px,3.4vw,38px);margin-bottom:12px}" +
    ".band p{color:#94a3b8;max-width:520px;margin:0 auto 30px}" +
    ".checks{display:flex;gap:22px;justify-content:center;flex-wrap:wrap;margin-top:26px;font-size:13.5px}" +
    ".checks span{display:inline-flex;align-items:center;gap:7px;opacity:.95}" +
    "details{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:18px 22px;margin-bottom:12px}" +
    "summary{font-weight:600;color:var(--ink);cursor:pointer;font-size:15.5px}details p{margin-top:10px;font-size:14.5px;color:var(--ink-3)}" +
    "footer{background:var(--navy);color:var(--muted);padding:34px 0;text-align:center;font-size:13.5px}" +
    "</style>" +
    creativeNav(biz, initial, navLinks, CTA) +
    "<header class='hero'>" + heroInner + "</header>" +
    mid + secQuotes() + secCTA() + (V.faq ? secFAQ() : "") +
    "<footer><div class='wrap'>© " + biz + " · Built from your onboarding call with Onboarding OS</div></footer>", t);
  return { html, theme: t.key };
}

export function buildFunnelHTML(c: CreativeFields): { html: string; theme: string } {
  const biz = escHtml(c.business), offer = escHtml(c.offer), aud = escHtml(c.audience), goal = escHtml(c.goal);
  const t = pickTheme("funnel");
  const V = rollUnique("funnel", () => {
    const v = { layout: rnd([0, 1]), hook: rnd([0, 1, 2]) };
    return { ...v, sig: [t.key, v.layout, v.hook].join("|") };
  });
  const STAGE_ICONS = [
    "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m3 11 18-5v12L3 14v-3z'/><path d='M11.6 16.8a3 3 0 1 1-5.8-1.6'/></svg>",
    "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='18' height='18' x='3' y='3' rx='2'/><path d='M3 9h18'/><path d='M9 21V9'/></svg>",
    "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='20' height='16' x='2' y='4' rx='2'/><path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'/></svg>",
    "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z'/></svg>",
    "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6 9 17l-5-5'/></svg>",
  ];
  const HOOKS = [
    "“Still putting off " + goal + "? Read this.”",
    "“The 90-day plan to " + goal + "”",
    "“" + cap(aud) + ", this one's for you.”",
  ];
  const stages = [
    { tag: "Stage 1 · Awareness", title: "Scroll-stopping ad", kpi: "Benchmark: 2 to 4% CTR",
      copy: "Run to " + aud + " on Meta &amp; Google. One promise and one CTA. Send clicks to the landing page.",
      quote: HOOKS[V.hook] + " · CTA: Learn more" },
    { tag: "Stage 2 · Consideration", title: "Landing page", kpi: "Benchmark: 25%+ opt-in",
      copy: "Show your offer, a 3-step plan and social proof above the fold.",
      quote: "Headline: “The simpler way to " + goal + "” · CTA: Book a free consult" },
    { tag: "Stage 3 · Lead capture", title: "Low-friction form", kpi: "Benchmark: &lt;60s to done",
      copy: "Name, email and one qualifying question. Instant confirmation email with a calendar link.",
      quote: "Question: “What's your #1 goal right now?”" },
    { tag: "Stage 4 · Conversion", title: "20-minute consult", kpi: "Benchmark: 1 in 3 close",
      copy: "Map their goals, present " + offer + " and close with clear next steps.",
      quote: "Opener: “Tell me where you are today and where you want to be in 90 days.”" },
    { tag: "Stage 5 · Client", title: "Signed &amp; onboarded", kpi: "Goal: " + goal,
      copy: "Your " + biz + " agent onboards the new client and generates the assets and follow-up copy.", quote: "" },
  ];

  function stageMain(s: (typeof stages)[number], i: number): string {
    return "<div class='stage-main'>" +
      "<div class='stage-top'><span class='stage-ic'>" + STAGE_ICONS[i] + "</span>" +
      "<div><span class='tag'>" + s.tag + "</span><h3>" + s.title + "</h3></div>" +
      "<span class='kpi'>" + s.kpi + "</span></div>" +
      "<p>" + s.copy + "</p>" +
      (s.quote ? "<div class='copyblock'><span>Copy to use</span>" + s.quote + "</div>" : "") +
      "</div>";
  }

  let body: string;
  if (V.layout === 1) {
    body = "<div class='funnel ftl'>" +
      stages.map((s, i) =>
        "<div class='stage rise" + (i === 4 ? " final" : "") + "' style='animation-delay:" + (i * 0.08) + "s'>" +
        "<span class='fnode'>" + (i + 1) + "</span>" + stageMain(s, i) + "</div>"
      ).join("") + "</div>";
  } else {
    const widths = [100, 88, 76, 64, 52];
    body = "<div class='funnel'>" +
      stages.map((s, i) => {
        const photo = "<img class='stage-photo' src='" + unsplash(STOCK.stages[i], 420) + "' alt='' width='150' height='112' loading='lazy'>";
        return "<div class='stage rise" + (i % 2 ? " flip" : "") + (i === 4 ? " final" : "") + "' style='width:" + widths[i] + "%;animation-delay:" + (i * 0.08) + "s'>" +
          stageMain(s, i) + photo + "</div>" +
          (i < 4 ? "<div class='arrow'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='M12 5v14'/><path d='m19 12-7 7-7-7'/></svg></div>" : "");
      }).join("") + "</div>";
  }

  const html = creativeShell(biz + " · Funnel",
    "<style>" +
    ".head{background:var(--grad);color:var(--btn-fg);padding:64px 0 150px;text-align:center;position:relative}" +
    ".head h1{color:var(--btn-fg);font-size:clamp(28px,4vw,40px);margin:16px 0 10px}" +
    ".head p{opacity:.92;max-width:560px;margin:0 auto;font-size:16.5px}" +
    ".metrics{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin:-92px auto 0;position:relative;z-index:2}" +
    ".metric{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow);padding:20px 28px;text-align:center;min-width:150px}" +
    ".metric strong{display:block;font-size:24px;color:var(--ink)}" +
    ".metric span{font-size:12.5px;color:var(--ink-3)}" +
    ".funnel{display:flex;flex-direction:column;align-items:center;padding:64px 24px 80px}" +
    ".stage{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:24px 28px;min-width:min(560px,92vw);max-width:820px;box-shadow:var(--shadow);display:flex;gap:22px;align-items:center}" +
    ".stage-main{flex:1;min-width:0}" +
    ".stage.flip{flex-direction:row-reverse}" +
    ".stage-photo{width:150px;aspect-ratio:4/3;object-fit:cover;border-radius:12px;background:var(--soft);flex-shrink:0}" +
    "@media(max-width:680px){.stage-photo{display:none}}" +
    ".stage-top{display:flex;align-items:center;gap:14px;margin-bottom:10px}" +
    ".stage-ic{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:var(--grad);color:var(--btn-fg);flex-shrink:0}" +
    ".tag{display:block;font-size:11.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--primary);margin-bottom:2px}" +
    ".stage h3{font-size:18px}" +
    ".kpi{margin-left:auto;background:var(--soft);color:var(--primary);font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;white-space:nowrap}" +
    ".stage p{font-size:14.5px;color:var(--ink-3)}" +
    ".copyblock{margin-top:14px;background:var(--bg);border:1px dashed var(--border);border-left:3px solid var(--primary);border-radius:10px;padding:12px 16px;font-size:14px;color:var(--ink-2)}" +
    ".copyblock span{display:block;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}" +
    ".arrow{color:var(--muted);padding:14px 0}" +
    ".stage.final{background:var(--navy);border-color:var(--navy)}" +
    ".stage.final h3{color:#fff}.stage.final p{color:#94a3b8}" +
    ".stage.final .tag{color:#a5b4fc}.stage.final .kpi{background:rgba(129,140,248,.16);color:#c7d2fe}" +
    ".funnel.ftl{align-items:stretch;max-width:860px;margin:0 auto;gap:26px;position:relative}" +
    ".funnel.ftl:before{content:'';position:absolute;left:21px;top:80px;bottom:80px;width:2px;background:var(--border)}" +
    ".funnel.ftl .stage{width:100%;margin-left:44px;position:relative;min-width:0}" +
    ".fnode{position:absolute;left:-44px;top:26px;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:var(--grad);color:var(--btn-fg);font-weight:700;box-shadow:0 0 0 5px var(--bg);z-index:1;transform:translateX(-22px)}" +
    "</style>" +
    "<div class='head'><div class='wrap'><span class='badge' style='background:rgba(0,0,0,.18);color:var(--btn-fg)'>" + biz + " · client acquisition funnel</span>" +
    "<h1>From first ad to signed client</h1><p>Each step mapped for " + aud + ", with ready-to-use copy and the benchmark to beat.</p></div></div>" +
    "<div class='metrics'>" +
    "<div class='metric'><strong>5</strong><span>funnel stages</span></div>" +
    "<div class='metric'><strong>2 to 4%</strong><span>target ad CTR</span></div>" +
    "<div class='metric'><strong>25%+</strong><span>page → booking</span></div>" +
    "<div class='metric'><strong>1 in 3</strong><span>calls → clients</span></div></div>" +
    body, t);
  return { html, theme: t.key };
}

export function buildGraphicsHTML(c: CreativeFields): { html: string; theme: string } {
  const biz = escHtml(c.business), aud = escHtml(c.audience), goal = escHtml(c.goal);
  const initial = escHtml((c.business || "B").trim().charAt(0).toUpperCase());
  const handle = "@" + biz.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const t = pickTheme("graphics");
  const V = rollUnique("graphics", () => {
    const v = { decor: rnd([0, 1, 2]), hook: rnd([0, 1, 2]), order: rnd([0, 1]) };
    return { ...v, sig: [t.key, v.decor, v.hook, v.order].join("|") };
  });
  const decor = [
    "<span class='dec dc1'></span><span class='dec dc2'></span><span class='dec ring'></span>",
    "<span class='dec rg rg1'></span><span class='dec rg rg2'></span><span class='dec rg rg3'></span>",
    "<span class='dec stripe'></span><span class='dec stripe s2'></span>",
  ][V.decor];
  const HOOKS = [
    ["Still putting off<br>" + goal + "?", "The 90-day plan to " + goal, biz + ", built for " + aud],
    [cap(goal) + ",<br>handled.", "Your next step toward " + goal, "Made for " + aud],
    ["Start " + goal + "<br>this week", cap(goal) + " without the wait", "For " + aud + ", by people who get it"],
  ][V.hook];

  const sq = "<div class='mock'><div class='ad sq'>" + decor + "<div class='logo'>" + initial + "</div>" +
    "<div><div class='hook'>" + HOOKS[0] + "</div><div class='meta'>Built for " + aud + "</div></div>" +
    "<span class='pill'>Learn more →</span></div><span class='label'>Feed <b>1080×1080</b></span></div>";
  const story = "<div class='mock'><div class='ad story'>" + decor + "<div class='logo'>" + initial + "</div>" +
    "<div><div class='hook'>" + HOOKS[1] + "</div><div class='meta'>" + handle + "</div></div>" +
    "<span class='pill'>Swipe up</span></div><span class='label'>Story <b>1080×1920</b></span></div>";
  const proof = "<div class='mock'><div class='ad sq2'>" + decor + "<div class='logo'>" + initial + "</div>" +
    "<div><span class='stars'>★★★★★</span><div class='hook'>“The easiest decision we made this year.”</div><div class='meta'>" + biz + " client</div></div>" +
    "<span class='pill'>Read their story</span></div><span class='label'>Proof ad <b>1080×1080</b></span></div>";
  const ban = "<div class='mock'><div class='ad ban'>" + decor + "<div class='logo'>" + initial + "</div>" +
    "<div class='hook'>" + HOOKS[2] + "</div>" +
    "<span class='pill'>Get started</span></div><span class='label'>Banner <b>728×90</b></span></div>";
  const mocks = V.order === 1 ? story + sq + ban + proof : sq + story + proof + ban;

  const html = creativeShell(biz + " · Ad graphics",
    "<style>" +
    "body{padding:56px 20px 72px}" +
    ".pagehead{text-align:center;margin-bottom:44px}" +
    ".pagehead h1{font-size:clamp(24px,3.4vw,32px);margin:14px 0 8px}" +
    ".pagehead p{color:var(--ink-3);font-size:15px}" +
    ".grid{display:flex;flex-wrap:wrap;gap:34px;justify-content:center;align-items:flex-start}" +
    ".mock{display:flex;flex-direction:column;gap:12px;align-items:center}" +
    ".label{font-size:12.5px;color:var(--ink-3);font-weight:600;display:flex;align-items:center;gap:6px}" +
    ".label b{background:var(--soft);color:var(--primary);font-size:11px;padding:3px 9px;border-radius:999px}" +
    ".ad{position:relative;overflow:hidden;border-radius:18px;color:var(--btn-fg);display:flex;flex-direction:column;justify-content:space-between;padding:26px;box-shadow:var(--shadow-lg)}" +
    ".sq2{color:#fff}" +
    ".dec{position:absolute;border-radius:50%;pointer-events:none}" +
    ".dc1{width:180px;height:180px;background:rgba(255,255,255,.08);top:-70px;right:-60px}" +
    ".dc2{width:120px;height:120px;background:rgba(255,255,255,.06);bottom:-50px;left:-40px}" +
    ".ring{width:90px;height:90px;border:2px solid rgba(255,255,255,.18);background:transparent;bottom:30px;right:-24px}" +
    ".rg{border:2px solid rgba(255,255,255,.16);background:transparent}" +
    ".rg1{width:140px;height:140px;top:-50px;left:-50px}" +
    ".rg2{width:90px;height:90px;top:40%;right:-30px}" +
    ".rg3{width:60px;height:60px;bottom:-20px;left:35%}" +
    ".stripe{border-radius:0;width:220%;height:70px;background:rgba(255,255,255,.07);top:18%;left:-60%;transform:rotate(-18deg)}" +
    ".stripe.s2{top:58%;height:36px;background:rgba(255,255,255,.05)}" +
    ".sq{width:320px;height:320px;background:var(--grad)}" +
    ".sq2{width:320px;height:320px;background:var(--navy)}" +
    ".story{width:200px;height:356px;background:var(--grad2)}" +
    ".ban{width:min(660px,92vw);height:96px;background:var(--grad);flex-direction:row;align-items:center;justify-content:space-between;padding:16px 26px;gap:16px}" +
    ".logo{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.22);font-weight:800;font-size:17px;backdrop-filter:blur(4px)}" +
    ".hook{font-family:" + t.df + ";font-size:21px;font-weight:800;line-height:1.22;margin:10px 0 6px;position:relative}" +
    ".story .hook{font-size:17px}.ban .hook{font-size:16.5px;margin:0}.sq2 .hook{font-size:18px;font-weight:700}" +
    ".meta{font-size:12px;opacity:.85;position:relative}" +
    ".pill{display:inline-flex;align-items:center;gap:6px;background:#fff;color:var(--primary);font-weight:700;font-size:13px;padding:9px 18px;border-radius:999px;position:relative;width:fit-content}" +
    ".stars{color:#fbbf24;letter-spacing:2px;font-size:14px;position:relative}" +
    "</style>" +
    "<div class='pagehead'><span class='badge'>" + biz + " · ad kit</span>" +
    "<h1>Ad graphics, ready to adapt</h1><p>Built from your onboarding call. Swap in brand photos before launch.</p></div>" +
    "<div class='grid'>" + mocks + "</div>", t);
  return { html, theme: t.key };
}

export type WebsiteOpts = {
  sections?: { pricing?: boolean; gallery?: boolean; faq?: boolean };
  overrides?: { headline?: string; cta?: string; brief?: string };
  themeKey?: string;
  v?: { hero: number; services: number; aboutSide: number; reviews: number; trust: number; head: number; cta: number; sig: string };
  overlay?: boolean;
};

export function buildWebsiteHTML(
  c: CreativeFields,
  opts?: WebsiteOpts
): { html: string; theme: string; spec: { themeKey: string; overlay: boolean; sections: { pricing: boolean; gallery: boolean; faq: boolean }; overrides: { headline: string | null; cta: string | null }; v: NonNullable<WebsiteOpts["v"]> } } {
  const o = opts || {};
  const sections = o.sections || {};
  const overrides = o.overrides || {};
  const biz = escHtml(c.business), offer = escHtml(c.offer), aud = escHtml(c.audience), goal = escHtml(c.goal), voice = escHtml(c.voice);
  const initial = escHtml((c.business || "B").trim().charAt(0).toUpperCase());
  const check = "<svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6 9 17l-5-5'/></svg>";
  let t: Theme | null = null;
  if (o.themeKey) {
    for (let ti = 0; ti < THEMES.length; ti++) if (THEMES[ti].key === o.themeKey) t = THEMES[ti];
  }
  if (!t) t = pickTheme("website");
  const theme = t;

  const V = o.v || rollUnique("website", () => {
    const v = {
      hero: rnd([0, 1, 2]), services: rnd([0, 1]), aboutSide: rnd([0, 1]),
      reviews: rnd([0, 1]), trust: rnd([0, 1]), head: rnd([0, 1, 2]), cta: rnd([0, 1, 2, 3]),
    };
    return {
      ...v,
      sig: [theme.key, v.hero, v.services, v.aboutSide, v.reviews, v.trust, v.head, v.cta,
        sections.pricing ? 1 : 0, sections.gallery ? 1 : 0, sections.faq ? 1 : 0].join("|"),
    };
  });
  if (typeof o.overlay === "boolean") V.hero = o.overlay ? 1 : (V.hero === 1 ? 0 : V.hero);

  const ctaText = overrides.cta ? escHtml(overrides.cta) : CTA_POOL[V.cta];
  const headline = overrides.headline ? escHtml(overrides.headline) : [
    cap(goal) + ", <span class='hl'>done right</span>",
    cap(offer) + " for <span class='hl'>" + aud + "</span>",
    "Meet <span class='hl'>" + biz + "</span>",
  ][V.head];
  const headlinePlain = headline.replace(/<[^>]+>/g, "");
  const subText = overrides.brief
    ? escHtml(overrides.brief)
    : biz + " provides " + offer + " for " + aud + ", handled with a " + voice + " approach from first call to final result.";
  const heroPhoto = unsplash(pickPhoto(biz + theme.key + V.hero, STOCK.hero), 1600);

  let heroHtml: string;
  if (V.hero === 1) {
    heroHtml =
      "<header class='hero hero-ov' style=\"background:linear-gradient(180deg,rgba(4,6,12,.55),rgba(4,6,12,.72)),url('" + heroPhoto + "') center/cover no-repeat\">" +
      "<div class='wrap' style='max-width:780px;text-align:center'>" +
      "<span class='badge on-dark rise'>" + check + " Trusted by " + aud + "</span>" +
      "<h1 class='rise d1' style='color:#fff'>" + headlinePlain + "</h1>" +
      "<p class='sub rise d2' style='color:#e2e8f0;margin:0 auto 30px'>" + subText + "</p>" +
      "<div class='rise d3' style='display:flex;gap:14px;flex-wrap:wrap;justify-content:center'><a class='btn' href='#contact'>" + ctaText + "</a><a class='btn ghost' href='#services'>Our services</a></div>" +
      "</div></header>";
  } else if (V.hero === 2) {
    heroHtml =
      "<header class='hero'><div class='wrap' style='max-width:760px;text-align:center'>" +
      "<span class='badge rise'>" + check + " Trusted by " + aud + "</span>" +
      "<h1 class='rise d1'>" + headline + "</h1>" +
      "<p class='sub rise d2' style='margin:0 auto 30px'>" + subText + "</p>" +
      "<div class='rise d3' style='display:flex;gap:14px;flex-wrap:wrap;justify-content:center'><a class='btn' href='#contact'>" + ctaText + "</a>" +
      "<a class='btn plain' href='#services'>Our services</a></div></div></header>";
  } else {
    heroHtml =
      "<header class='hero'><div class='wrap hero-grid'>" +
      "<div><span class='badge rise'>" + check + " Trusted by " + aud + "</span>" +
      "<h1 class='rise d1'>" + headline + "</h1>" +
      "<p class='sub rise d2'>" + subText + "</p>" +
      "<div class='rise d3' style='display:flex;gap:14px;flex-wrap:wrap'><a class='btn' href='#contact'>" + ctaText + "</a>" +
      "<a class='btn plain' href='#services'>Our services</a></div></div>" +
      "<div class='hero-visual rise d2'>" +
      "<img class='hv-img' src='" + heroPhoto + "' alt='The " + biz + " team at work' width='800' height='600'>" +
      "<div class='hero-card'><h3>Why clients choose " + biz + "</h3><ul style='padding:0;margin:0'>" +
      "<li>" + check + " " + cap(offer) + " tailored to you</li>" +
      "<li>" + check + " Clear plan and pricing before you commit</li>" +
      "<li>" + check + " Direct access to our team</li>" +
      "<li>" + check + " Results measured against your goal: " + goal + "</li>" +
      "</ul></div></div></div></header>";
  }

  let trustHtml: string;
  if (V.trust === 1) {
    trustHtml = "<div class='trust'><div class='wrap trust-chips'>" +
      ["Licensed &amp; insured", "5-star rated", "Fast turnaround", "Built for " + aud].map((x) => "<span>" + check + " " + x + "</span>").join("") + "</div></div>";
  } else {
    trustHtml = "<div class='trust'><div class='wrap'>" +
      "<div class='t'><strong>100+</strong><span>happy clients</span></div>" +
      "<div class='t'><strong>4.9★</strong><span>average rating</span></div>" +
      "<div class='t'><strong>10+ yrs</strong><span>combined experience</span></div>" +
      "<div class='t'><strong>24h</strong><span>response time</span></div>" +
      "</div></div>";
  }

  const svcData = [
    { h: cap(offer), p: "Our core service, delivered with a proven process and clear updates at each step.", ic: "<circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/>" },
    { h: "Free consultation", p: "A 20-minute call to map your situation and goals. You leave with next steps either way.", ic: "<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>" },
    { h: "Ongoing support", p: "Stay on track after launch with check-ins, adjustments and direct access to our team.", ic: "<path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M23 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/>" },
  ];
  let servicesInner: string;
  if (V.services === 1) {
    servicesInner = "<div class='svc-rows'>" + svcData.map((s) =>
      "<div class='svc-row'><span class='ic'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + s.ic + "</svg></span><div><h3>" + s.h + "</h3><p>" + s.p + "</p></div></div>"
    ).join("") + "</div>";
  } else {
    servicesInner = "<div class='grid3'>" + svcData.map((s) =>
      "<div class='card'><span class='ic'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + s.ic + "</svg></span><h3>" + s.h + "</h3><p>" + s.p + "</p></div>"
    ).join("") + "</div>";
  }

  const aboutImg = "<div class='about-visual'><img src='" + unsplash(pickPhoto(biz + "about" + theme.key, STOCK.about), 1000) + "' alt='Inside " + biz + "' width='800' height='600' loading='lazy'></div>";
  const aboutText = "<div><p class='eyebrow'>About us</p><h2 style='font-size:clamp(24px,3vw,32px);margin-bottom:16px'>The team behind " + biz + "</h2>" +
    "<p>We started " + biz + " to give " + aud + " " + offer + " with a " + voice + " approach.</p>" +
    "<p>You work directly with our team from the first call until you " + goal + ".</p>" +
    "<a class='btn' style='margin-top:10px' href='#contact'>Work with us</a></div>";
  const aboutInner = V.aboutSide === 1 ? aboutText + aboutImg : aboutImg + aboutText;

  const revData = [
    { q: biz + " made the whole process feel easy.", i: 3 },
    { q: "They understood what we needed and delivered it.", i: 4 },
    { q: "We hit our goal, " + goal + ", ahead of schedule.", i: 5 },
  ];
  let reviewsInner: string;
  if (V.reviews === 1) {
    reviewsInner = "<div class='bigquote' style='max-width:700px;margin:0 auto;text-align:center'><span class='stars'>★★★★★</span>" +
      "<p>“" + revData[0].q + "”</p>" +
      "<div class='who' style='justify-content:center'>" + avatarImg(3, 40) + "<div style='text-align:left'><strong>Add a real client</strong><span>Replace with real reviews</span></div></div></div>";
  } else {
    reviewsInner = "<div class='grid3'>" + revData.map((r) =>
      "<div class='card'><span class='stars'>★★★★★</span><p class='quote' style='margin-top:12px'>“" + r.q + "”</p><div class='who'>" + avatarImg(r.i, 40) + "<div><strong>Add a real client</strong><span>Replace with real reviews</span></div></div></div>"
    ).join("") + "</div>";
  }

  const html = creativeShell(biz + " · Website",
    "<style>" +
    ".hero{position:relative;overflow:hidden;background:var(--hero-bg);padding:88px 0}" +
    ".hero-ov{padding:130px 0}" +
    ".hero-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center}" +
    "@media(max-width:860px){.hero-grid{grid-template-columns:1fr}}" +
    ".hero h1{font-size:clamp(32px,4.6vw,50px);font-weight:800;margin:18px 0 16px}" +
    ".hero .sub{font-size:17.5px;color:var(--ink-3);margin-bottom:30px;max-width:520px}" +
    ".hero-visual{position:relative}" +
    ".hv-img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r-lg);box-shadow:var(--shadow-lg);background:var(--soft)}" +
    ".hero-card{background:var(--grad);border-radius:var(--r-md);padding:26px;color:var(--btn-fg);box-shadow:var(--shadow-lg);margin:-72px 22px 0;position:relative}" +
    ".hero-card h3{color:var(--btn-fg);font-size:16px;margin-bottom:14px}" +
    ".hero-card li{list-style:none;display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-bottom:11px;opacity:.96}" +
    ".hero-card li svg{margin-top:2px;flex-shrink:0}" +
    ".trust{background:var(--navy);padding:26px 0}" +
    ".trust .wrap{display:flex;gap:20px;justify-content:space-around;flex-wrap:wrap}" +
    ".trust .t{text-align:center;color:#e2e8f0}.trust strong{display:block;font-size:22px}" +
    ".trust span{font-size:12.5px;color:#94a3b8}" +
    ".trust-chips{justify-content:center;gap:14px 34px}" +
    ".trust-chips span{display:inline-flex;align-items:center;gap:9px;color:#e2e8f0;font-size:14px;font-weight:600}" +
    ".trust-chips svg{color:#4ade80}" +
    ".sec{padding:84px 0}.sec-head{text-align:center;max-width:620px;margin:0 auto 48px}" +
    ".sec-head h2{font-size:clamp(25px,3.2vw,34px);margin-bottom:12px}.sec-head p{color:var(--ink-3)}" +
    ".grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:22px}" +
    ".card h3{font-size:17.5px;margin:16px 0 8px}.card p{font-size:14.5px;color:var(--ink-3)}" +
    ".svc-rows{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:16px}" +
    ".svc-row{display:flex;gap:20px;align-items:flex-start;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:24px 26px;box-shadow:0 1px 2px rgba(0,0,0,.04)}" +
    ".svc-row h3{font-size:17px;margin:2px 0 6px}.svc-row p{font-size:14.5px;color:var(--ink-3)}" +
    ".about{display:grid;grid-template-columns:.9fr 1.1fr;gap:56px;align-items:center}" +
    "@media(max-width:860px){.about{grid-template-columns:1fr}}" +
    ".about-visual{position:relative}" +
    ".about-visual img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r-lg);box-shadow:var(--shadow);background:var(--soft)}" +
    ".about p{color:var(--ink-3);font-size:15.5px;margin-bottom:14px}" +
    ".quote{font-size:15.5px;color:var(--ink-2)}.stars{color:#f59e0b;letter-spacing:2px}" +
    ".bigquote{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:44px 40px;box-shadow:var(--shadow)}" +
    ".bigquote p{font-size:clamp(18px,2.4vw,24px);color:var(--ink);line-height:1.5;margin:16px 0 24px}" +
    ".who{display:flex;align-items:center;gap:12px;margin-top:16px}" +
    ".who strong{display:block;font-size:13.5px;color:var(--ink)}.who span{font-size:12px;color:var(--muted)}" +
    ".contact{display:grid;grid-template-columns:1fr 1fr;gap:34px}" +
    "@media(max-width:800px){.contact{grid-template-columns:1fr}}" +
    ".field{margin-bottom:16px}.field label{display:block;font-size:13px;font-weight:600;color:var(--ink);margin-bottom:6px}" +
    ".field input,.field textarea{width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:10px;font:inherit;font-size:14.5px;background:var(--surface)}" +
    ".info{background:var(--navy);border-radius:var(--r-md);padding:32px;color:#e2e8f0}" +
    ".info h3{color:#fff;margin-bottom:16px}.info p{font-size:14.5px;color:#94a3b8;margin-bottom:18px}" +
    ".info .row{display:flex;gap:12px;align-items:center;font-size:14px;margin-bottom:12px}" +
    ".price-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px;align-items:stretch}" +
    ".price{display:flex;flex-direction:column}" +
    ".price .amt{font-family:" + theme.df + ";font-size:34px;color:var(--ink);margin:8px 0 2px}" +
    ".price .per{font-size:12.5px;color:var(--muted)}" +
    ".price ul{list-style:none;padding:0;margin:16px 0 22px;flex:1}" +
    ".price li{display:flex;gap:9px;align-items:flex-start;font-size:14px;color:var(--ink-3);margin-bottom:10px}" +
    ".price li svg{color:var(--primary);margin-top:2px;flex-shrink:0}" +
    ".price.feat{border:2px solid var(--primary);position:relative}" +
    ".price.feat .tagline{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--grad);color:var(--btn-fg);font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:5px 14px;border-radius:999px}" +
    ".gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}" +
    ".gal img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r-sm);background:var(--soft)}" +
    "details{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:18px 22px;margin-bottom:12px}" +
    "summary{font-weight:600;color:var(--ink);cursor:pointer;font-size:15.5px}details p{margin-top:10px;font-size:14.5px;color:var(--ink-3)}" +
    "footer{background:var(--navy);color:var(--muted);padding:40px 0;border-top:1px solid rgba(148,163,184,.15)}" +
    "footer .wrap{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:13.5px}" +
    "</style>" +
    creativeNav(biz, initial, [["Services", "services"], ["About", "about"], ["Reviews", "reviews"], ["Contact", "contact"]], ctaText, "contact") +
    heroHtml +
    trustHtml +
    "<section class='sec' id='services'><div class='wrap'>" +
    "<div class='sec-head'><p class='eyebrow'>Services</p><h2>What we do</h2><p>What " + aud + " need to " + goal + ".</p></div>" +
    servicesInner + "</div></section>" +
    "<section class='sec' id='about' style='background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)'><div class='wrap about'>" +
    aboutInner + "</div></section>" +
    "<section class='sec' id='reviews'><div class='wrap'>" +
    "<div class='sec-head'><p class='eyebrow'>Reviews</p><h2>What clients say</h2></div>" +
    reviewsInner + "</div></section>" +
    (!sections.pricing ? "" :
      "<section class='sec' id='pricing' style='background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)'><div class='wrap'>" +
      "<div class='sec-head'><p class='eyebrow'>Pricing</p><h2>Simple pricing</h2><p>Each plan starts with a free consult.</p></div>" +
      "<div class='price-grid'>" +
      "<div class='card price'><h3>Starter</h3><div class='amt'>$497</div><span class='per'>one-time</span><ul>" +
      "<li>" + check + " Initial strategy session</li><li>" + check + " The essentials of " + offer + "</li><li>" + check + " Email support</li></ul>" +
      "<a class='btn plain' style='justify-content:center' href='#contact'>Choose Starter</a></div>" +
      "<div class='card price feat'><span class='tagline'>Most popular</span><h3>Pro</h3><div class='amt'>$997</div><span class='per'>per month</span><ul>" +
      "<li>" + check + " Everything in Starter</li><li>" + check + " Full " + offer + "</li><li>" + check + " Priority support &amp; check-ins</li><li>" + check + " Progress toward: " + goal + "</li></ul>" +
      "<a class='btn' style='justify-content:center' href='#contact'>Choose Pro</a></div>" +
      "<div class='card price'><h3>Premium</h3><div class='amt'>Custom</div><span class='per'>let's talk</span><ul>" +
      "<li>" + check + " Everything in Pro</li><li>" + check + " Dedicated specialist</li><li>" + check + " Tailored for " + aud + "</li></ul>" +
      "<a class='btn plain' style='justify-content:center' href='#contact'>Contact us</a></div>" +
      "</div></div></section>") +
    (!sections.gallery ? "" :
      "<section class='sec' id='gallery'><div class='wrap'>" +
      "<div class='sec-head'><p class='eyebrow'>Gallery</p><h2>Our work in pictures</h2><p>Swap these for your own photos before launch.</p></div>" +
      "<div class='gal'>" +
      STOCK.hero.slice(0, 3).concat(STOCK.about).map((id, gi) =>
        "<img src='" + unsplash(id, 640) + "' alt='" + biz + " gallery photo " + (gi + 1) + "' width='640' height='480' loading='lazy'>"
      ).join("") +
      "</div></div></section>") +
    (!sections.faq ? "" :
      "<section class='sec' id='faq' style='padding-top:0'><div class='wrap' style='max-width:720px'>" +
      "<div class='sec-head'><p class='eyebrow'>FAQ</p><h2>Common questions</h2></div>" +
      "<details open><summary>Who is this for?</summary><p>" + cap(aud) + " who want to " + goal + " without wasting months figuring it out alone.</p></details>" +
      "<details><summary>What exactly do I get?</summary><p>" + cap(offer) + ", with direct support from the " + biz + " team.</p></details>" +
      "<details><summary>How do we start?</summary><p>Book a free consult below. We map where you are, where you want to be, and what's in the way. You leave with next steps either way.</p></details>" +
      "</div></section>") +
    "<section class='sec' id='contact' style='padding-top:0'><div class='wrap'>" +
    "<div class='sec-head'><p class='eyebrow'>Contact</p><h2>Let's talk</h2><p>Tell us where you are. We reply within one business day.</p></div>" +
    "<div class='contact'>" +
    "<form class='card' onsubmit='return false'>" +
    "<div class='field'><label for='n'>Name</label><input id='n' type='text' placeholder='Jane Smith' autocomplete='name'></div>" +
    "<div class='field'><label for='e'>Email</label><input id='e' type='email' placeholder='jane@company.com' autocomplete='email'></div>" +
    "<div class='field'><label for='m'>What's your #1 goal right now?</label><textarea id='m' rows='4' placeholder='Tell us a little about what you need…'></textarea></div>" +
    "<button class='btn' type='submit' style='width:100%;justify-content:center'>Send message</button></form>" +
    "<div class='info'><h3>" + biz + "</h3><p>" + cap(offer) + " for " + aud + ".</p>" +
    "<div class='row'><svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='20' height='16' x='2' y='4' rx='2'/><path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'/></svg> hello@" + biz.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com</div>" +
    "<div class='row'><svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z'/></svg> (555) 000-0000 (replace with yours)</div>" +
    "<div class='row'><svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z'/><circle cx='12' cy='10' r='3'/></svg> Your city (replace with your address)</div>" +
    "</div></div></div></section>" +
    "<footer><div class='wrap'><span>© " + biz + ". All rights reserved.</span><span>Built from your onboarding call with Onboarding OS</span></div></footer>", theme);
  return {
    html,
    theme: theme.key,
    spec: {
      themeKey: theme.key,
      overlay: V.hero === 1,
      sections: { pricing: !!sections.pricing, gallery: !!sections.gallery, faq: !!sections.faq },
      overrides: { headline: overrides.headline || null, cta: overrides.cta || null },
      v: V,
    },
  };
}

export type CreativeKind = "landing" | "funnel" | "graphics" | "website";

export const CREATIVE_KINDS: Record<CreativeKind, { label: string; build: (c: CreativeFields) => { html: string; theme: string } }> = {
  landing: { label: "Landing page", build: buildLandingHTML },
  funnel: { label: "Funnel", build: buildFunnelHTML },
  graphics: { label: "Ad graphics", build: buildGraphicsHTML },
  website: { label: "Website", build: buildWebsiteHTML },
};

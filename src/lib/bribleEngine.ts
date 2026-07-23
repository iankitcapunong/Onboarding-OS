import { THEMES, type CreativeCtx, type CreativeFields, type WebsiteOpts } from "./creativeBuilders";

/* ============================================================
   BRIBLE ENGINE — pure state/data logic for the Brible AI website
   builder (js/app.js lines 3858-5398). No React, no Supabase network
   calls, no DOM rendering: everything here is either plain data
   transforms or string<->string HTML-string manipulation (via
   DOMParser, never a live/attached DOM), safe to unit-test on its own.
   The React orchestration (state, AI calls, credits, progress) lives
   in src/hooks/useBrible.tsx, which imports and wires these functions
   together. ============================================================ */

/* ---- spec: the local (non-AI) template-engine's per-site config,
   read/written by buildWebsiteHTML (src/lib/creativeBuilders.ts) ---- */
export type BribleSectionsFlags = { pricing?: boolean; gallery?: boolean; faq?: boolean };
export type BribleOverrides = { headline?: string | null; cta?: string | null; brief?: string | null };
export type BribleSpecVariant = NonNullable<WebsiteOpts["v"]>;
export type BribleSpec = {
  themeKey: string | null;
  overlay: boolean | null;
  sections: BribleSectionsFlags;
  overrides: BribleOverrides;
  v?: BribleSpecVariant;
};

/* ---- blueprint/shell: AI-authored JSON/HTML (see
   supabase/functions/brible/index.ts server-side for the authoritative
   shape). Treated here as data this app threads through, not something
   it constructs — hence the index signature for fields we don't read. ---- */
export type BribleBlueprintSection = { intent?: string; [key: string]: unknown };
export type BribleBlueprintPage = { slug: string; name?: string; sections?: BribleBlueprintSection[]; [key: string]: unknown };
export type BribleBlueprint = {
  kind?: string;
  pages?: BribleBlueprintPage[];
  nav?: { order?: string[]; [key: string]: unknown };
  flow?: { order?: string[]; [key: string]: unknown };
  [key: string]: unknown;
};

export type BriblePages = Record<string, string>;

/* ---- versions: a version is either a legacy/local single-page doc
   (only `html` set, `pages` empty) or a multi-page AI site (`pages` +
   `blueprint` + `shellHtml`). bribleVPages/VActiveSlug/IsMultiPage give
   the rest of the app one code path regardless of which. ---- */
export type BribleVersion = {
  id: string;
  prompt: string;
  ts: number;
  themeKey: string;
  spec: BribleSpec | null;
  blueprint: BribleBlueprint | null;
  shellHtml: string | null;
  pages: BriblePages;
  activeSlug: string;
  html: string;
};

export type BribleChatMessage = { role: "user" | "bot"; text: string };

/* progress-reporting for the AI pipeline (blueprint/shell/each page) —
   the framework-agnostic replacement for the original's DOM-based
   bribleGenStatus/bribleGenStep spinner-to-checkmark rows. */
export type GenStepState = "active" | "done" | "error";
export type GenStep = { key: string; label: string; state: GenStepState };

/* the "selected element" set by the (Part-2-owned) inline visual editor
   click handler: tag/class/text of whatever the user clicked in the
   preview iframe while Edit mode is on. */
export type BribleSelection = { tag: string; cls: string; text: string };

export type BribleState = {
  spec: BribleSpec | null;
  activeId: string | null;
  versions: BribleVersion[];
  chat: BribleChatMessage[];
  name?: string | null;
  savedId?: string | null;
  /* Part 2 addition (not in the original Part 1 contract): a "community
     remix" seeds a version from an arbitrary {ctx, spec} pair unrelated
     to the hook's own live-derived ctx (call capture / memory / demo).
     Mirrors the original's `brb.ctx` override read by bribleCtx() —
     set by remixTemplate(), cleared by newSite() (which never includes
     this field on its reset object). */
  ctxOverride?: CreativeFields | null;
};

export function emptyBribleState(): BribleState {
  return { spec: null, activeId: null, versions: [], chat: [] };
}

/* generation output shape shared by the local engine, the AI pipeline,
   and every visual/structural edit path (bribleApplySelEdit,
   bribleApplyToken, bribleMoveSection, ...) — whatever produced a new
   html/pages, makeVersion() below turns it into a real BribleVersion. */
export type BribleGenOutput = {
  html?: string;
  theme?: string;
  spec?: BribleSpec | null;
  blueprint?: BribleBlueprint | null;
  shellHtml?: string | null;
  pages?: BriblePages;
  activeSlug?: string;
};

export function bribleActive(state: BribleState): BribleVersion | null {
  if (!state.versions.length) return null;
  const found = state.versions.find((v) => v.id === state.activeId);
  return found ?? state.versions[state.versions.length - 1];
}

export function bribleVPages(v: BribleVersion | null | undefined): BriblePages {
  if (!v) return {};
  if (v.pages && Object.keys(v.pages).length) return v.pages;
  if (v.html) return { home: v.html };
  return {};
}

export function bribleVActiveSlug(v: BribleVersion | null | undefined): string | undefined {
  const pages = bribleVPages(v);
  if (v && v.activeSlug && pages[v.activeSlug]) return v.activeSlug;
  return pages.home ? "home" : Object.keys(pages)[0];
}

export function bribleIsMultiPage(v: BribleVersion | null | undefined): boolean {
  return Object.keys(bribleVPages(v)).length > 1;
}

/* runs fn(item) over items with at most `limit` in flight at once,
   resolving to results in the original order. Used for page-generation
   (pool of 3) and publish uploads (pool of 3). */
export function concurrentMap<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  return new Promise((resolve, reject) => {
    if (!items.length) {
      resolve([]);
      return;
    }
    const results: R[] = new Array(items.length);
    let next = 0;
    let active = 0;
    let done = 0;
    let failed = false;
    function pump() {
      if (failed) return;
      while (active < limit && next < items.length) {
        const i = next;
        active++;
        fn(items[i], i).then(
          (r) => {
            results[i] = r;
            active--;
            done++;
            if (done === items.length) resolve(results);
            else pump();
          },
          (e) => {
            failed = true;
            reject(e as Error);
          }
        );
        next++;
      }
    }
    pump();
  });
}

/* builds the BribleVersion that gets pushed onto state.versions — the
   id/ts stamping + pages/activeSlug resolution from briblePushVersion(). */
export function makeVersion(prompt: string, out: BribleGenOutput, fallbackSpec: BribleSpec | null): BribleVersion {
  const pages: BriblePages = out.pages || { home: out.html as string };
  const activeSlug = out.activeSlug && pages[out.activeSlug] ? out.activeSlug : pages.home ? "home" : Object.keys(pages)[0];
  const resolvedSlug = activeSlug ?? "home";
  return {
    id: `bv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    prompt,
    ts: Date.now(),
    themeKey: out.theme || "AI",
    spec: out.spec ?? fallbackSpec,
    blueprint: out.blueprint ?? null,
    shellHtml: out.shellHtml ?? null,
    pages,
    activeSlug: resolvedSlug,
    html: pages[resolvedSlug] ?? "",
  };
}

/* converts our persisted BribleSpec (nulls for "unset") into the
   WebsiteOpts shape buildWebsiteHTML expects (undefined for "unset"). */
export function specToWebsiteOpts(spec: BribleSpec | null | undefined): WebsiteOpts | undefined {
  if (!spec) return undefined;
  return {
    themeKey: spec.themeKey ?? undefined,
    overlay: spec.overlay ?? undefined,
    sections: spec.sections,
    overrides: {
      headline: spec.overrides.headline ?? undefined,
      cta: spec.overrides.cta ?? undefined,
      brief: spec.overrides.brief ?? undefined,
    },
    v: spec.v,
  };
}

function cloneSpec(spec: BribleSpec | null): BribleSpec {
  return spec ? (JSON.parse(JSON.stringify(spec)) as BribleSpec) : { themeKey: null, overlay: null, sections: {}, overrides: {} };
}

export type BribleParseResult = { spec: BribleSpec; changes: string[] };

/* ---- local (non-AI) engine: turns a free-text instruction into spec
   changes via rule-matching (theme keywords, section add/remove,
   headline/cta quote-capture, "surprise me"). Ported verbatim —
   calibrated product logic, not something to "simplify". ---- */
export function bribleParse(currentSpec: BribleSpec | null, text: string): BribleParseResult | null {
  const spec = cloneSpec(currentSpec);
  spec.sections = spec.sections || {};
  spec.overrides = spec.overrides || {};
  const lower = text.toLowerCase();
  const changes: string[] = [];

  const themeRules: [RegExp, string, string][] = [
    [/noir|luxur|premium|gold|elegant|black|dark/, "Noir", "switched to the dark Noir look"],
    [/editorial|cream|paper|serif|organic|earthy|natural/, "Editorial", "switched to the Editorial cream look"],
    [/neon|tech|cyber|futuristic/, "Neon Tech", "switched to the Neon Tech look"],
    [/sunset|warm|orange|coral|pink|friendly|playful/, "Sunset", "switched to the warm Sunset look"],
    [/ocean|blue|teal|fresh|calm/, "Ocean", "switched to the Ocean look"],
    [/aurora|purple|violet|indigo/, "Aurora", "switched to the Aurora look"],
    [/light|bright|white/, "Aurora", "switched to a light look"],
  ];
  for (const [re, key, msg] of themeRules) {
    if (re.test(lower)) {
      if (spec.themeKey !== key) {
        spec.themeKey = key;
        changes.push(msg);
      }
      break;
    }
  }

  if (/surprise|regenerate|redesign|another (look|design|style)|new (look|design|style)|try something/.test(lower)) {
    const pool = THEMES.filter((th) => th.key !== spec.themeKey);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    spec.themeKey = pick.key;
    spec.overlay = Math.random() < 0.5;
    changes.push(`redesigned it in the ${spec.themeKey} style`);
  }

  if (/full[- ]?bleed|photo (hero|background)|hero (photo|image)|image behind|overlay hero/.test(lower)) {
    spec.overlay = true;
    changes.push("made the hero a full-width photo");
  } else if (/split hero|side[- ]?by[- ]?side|text (left|beside)/.test(lower)) {
    spec.overlay = false;
    changes.push("switched to the split hero layout");
  }

  const secRules: [RegExp, "pricing" | "faq" | "gallery", string][] = [
    [/pricing|price|plans|packages/, "pricing", "pricing section"],
    [/faq|questions/, "faq", "FAQ section"],
    [/gallery|photos|portfolio|images section/, "gallery", "photo gallery"],
  ];
  const removing = /remove|delete|drop|without|hide|no /.test(lower);
  secRules.forEach(([re, key, label]) => {
    if (re.test(lower)) {
      const want = !removing;
      if (!!spec.sections[key] !== want) {
        spec.sections[key] = want;
        changes.push((want ? "added the " : "removed the ") + label);
      }
    }
  });

  const hm =
    text.match(/headline\s*(?:to|:|say(?:s)?|should (?:be|say))?\s*["“']([^"”']{3,90})["”']/i) ||
    text.match(/["“']([^"”']{3,90})["”']\s*(?:as|for)\s*(?:the\s*)?headline/i);
  if (hm) {
    spec.overrides.headline = hm[1];
    changes.push(`set the headline to “${hm[1]}”`);
  }

  const bm = text.match(/(?:button|cta)\s*(?:to|:|say(?:s)?|should (?:be|say))?\s*["“']([^"”']{2,40})["”']/i);
  if (bm) {
    spec.overrides.cta = bm[1];
    changes.push(`set the button text to “${bm[1]}”`);
  }

  return changes.length ? { spec, changes } : null;
}

/* ---- last-resort local fallback: used only when nothing in
   bribleParse matched AND real AI is unavailable or failed. Treats the
   raw message as new positioning copy so a message never just gets "I
   didn't catch that" with the site left exactly as it was. ---- */
export function bribleFallbackSpec(currentSpec: BribleSpec | null, text: string): BribleSpec {
  const spec = cloneSpec(currentSpec);
  spec.sections = spec.sections || {};
  spec.overrides = spec.overrides || {};
  spec.overrides.brief = text.trim();
  return spec;
}

export const BRIBLE_HELP =
  'I can restyle it ("make it dark and premium", "warm and friendly", "ocean blue"), change the hero ("full-width photo hero"), ' +
  'add or remove sections ("add pricing", "add FAQ", "add a gallery"), set copy (headline to "...", button to "..."), ' +
  'or redesign from scratch ("surprise me"). Deploy the Brible AI function to unlock free-form editing.';

export function bribleWelcomeText(ctx: CreativeCtx): string {
  return (
    `Hey! I'm Brible. Your AI website builder. I already know ${ctx.business}` +
    (ctx._fromCall ? " from your onboarding call" : " (demo details until you run an onboarding call)") +
    `: ${ctx.offer} for ${ctx.audience}. Say “Build my website” or describe exactly what you want.`
  );
}

/* decides whether a chat instruction should regenerate the whole site
   (blueprint/shell/all pages) or just the currently active page. The
   scope selector (auto/page/site) always wins when set explicitly;
   "auto" falls back to a small set of site-wide trigger phrases. */
export function bribleEditScope(text: string, uiScope: "auto" | "page" | "site" = "auto"): "site" | "page" {
  if (uiScope === "site") return "site";
  if (uiScope === "page") return "page";
  const lower = text.toLowerCase();
  if (
    /theme|rebrand|color scheme|palette|font|whole site|every page|all pages|add a .*page|new page|remove the .*page|delete the .*page|\bnav\b|navigation|footer|redesign|surprise me|funnel|checkout|add a stage|add a step/.test(
      lower
    )
  )
    return "site";
  return "page";
}

/* ---- inline text editing: given a text selection and new text, patch
   the corresponding text node in a page's stored HTML string. ---- */
export function escTextToHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function replaceTextInHtml(html: string, oldText: string, newText: string): string | null {
  const candidates = [escTextToHtml(oldText), oldText];
  for (const c of candidates) {
    if (c && html.indexOf(c) > -1) {
      return html.replace(c, escTextToHtml(newText));
    }
  }
  return null;
}

/* ---- design tokens: read/write CSS custom properties inside a stored
   HTML string's <style> block. The shell prompt guarantees these exact
   variable names exist on :root (see supabase/functions/brible), so a
   color/font/radius/spacing control can reliably target them. ---- */
function escapeRegExp(s: string): string {
  return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export function tokenValue(html: string, varName: string): string {
  if (!html) return "";
  const re = new RegExp(`${escapeRegExp(varName)}\\s*:\\s*([^;]+);`);
  const m = html.match(re);
  return m ? m[1].trim() : "";
}

export function setToken(html: string, varName: string, value: string): string {
  const re = new RegExp(`(${escapeRegExp(varName)}\\s*:\\s*)[^;]+;`);
  if (!re.test(html)) return html;
  return html.replace(re, `$1${value.replace(/\$/g, "$$$$")};`);
}

export type DesignTokenOption = { label: string; value: string };
export type DesignToken = {
  name: string;
  label: string;
  type: "color" | "font" | "segmented";
  options?: DesignTokenOption[];
};

export const DESIGN_TOKENS: DesignToken[] = [
  { name: "--b-color-primary", label: "Primary", type: "color" },
  { name: "--b-color-secondary", label: "Secondary", type: "color" },
  { name: "--b-color-accent", label: "Accent", type: "color" },
  { name: "--b-color-surface", label: "Surface", type: "color" },
  { name: "--b-color-text", label: "Text", type: "color" },
  { name: "--b-font-display", label: "Display font", type: "font" },
  { name: "--b-font-body", label: "Body font", type: "font" },
  {
    name: "--b-radius",
    label: "Corner radius",
    type: "segmented",
    options: [
      { label: "Sharp", value: "2px" },
      { label: "Soft", value: "12px" },
      { label: "Pill", value: "999px" },
    ],
  },
  {
    name: "--b-space",
    label: "Spacing",
    type: "segmented",
    options: [
      { label: "Compact", value: "0.75rem" },
      { label: "Airy", value: "1.25rem" },
    ],
  },
];

export const QUICK_FONTS = ["Inter", "Poppins", "Playfair Display", "Space Grotesk", "DM Sans", "Fraunces", "Sora", "Manrope"];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---- visual editor: section outline (move/duplicate/delete/reorder).
   Structural edits never touch a live/attached DOM — they operate on
   the stored HTML string via DOMParser, then the caller re-renders an
   iframe from the returned string, same as every other edit here. ---- */
function parseHtmlDoc(html: string): Document | null {
  try {
    return new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }
}

function serializeDoc(doc: Document): string {
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

// the top-level, tagged sections directly inside <main> — the visual
// editor's unit of "a section"
function sectionNodesOf(doc: Document): Element[] {
  const main = doc.querySelector("main");
  let nodes: Element[] = [];
  if (main) {
    nodes = Array.from(main.children).filter((el) => el.hasAttribute("data-b-section"));
  }
  if (!nodes.length) nodes = Array.from(doc.querySelectorAll("[data-b-section]"));
  return nodes;
}

function mutateSectionsHtml(html: string, mutator: (doc: Document) => boolean): string | null {
  const doc = parseHtmlDoc(html);
  if (!doc) return null;
  if (mutator(doc) === false) return null;
  return serializeDoc(doc);
}

export type SectionOutlineItem = { id: string; type: string; label: string };

export function sectionOutlineFromHtml(html: string, bpSections?: BribleBlueprintSection[]): SectionOutlineItem[] {
  const doc = parseHtmlDoc(html);
  if (!doc) return [];
  const nodes = sectionNodesOf(doc);
  const sections = bpSections || [];
  return nodes.map((node, i) => {
    const type = node.getAttribute("data-b-section") || "section";
    const id = node.getAttribute("data-b-id") || `sec-${i}`;
    const bp = sections[i];
    return { id, type, label: bp?.intent ? bp.intent : cap(type) };
  });
}

export function moveSectionInHtml(html: string, id: string, dir: -1 | 1): string | null {
  return mutateSectionsHtml(html, (doc) => {
    const nodes = sectionNodesOf(doc);
    const idx = nodes.findIndex((n) => n.getAttribute("data-b-id") === id);
    if (idx === -1) return false;
    const target = dir < 0 ? idx - 1 : idx + 1;
    if (target < 0 || target >= nodes.length) return false;
    if (dir < 0) nodes[idx].parentNode?.insertBefore(nodes[idx], nodes[target]);
    else nodes[target].parentNode?.insertBefore(nodes[target], nodes[idx]);
    return true;
  });
}

export function reorderSectionsInHtml(html: string, order: string[]): string | null {
  return mutateSectionsHtml(html, (doc) => {
    const nodes = sectionNodesOf(doc);
    if (!nodes.length) return false;
    const byId: Record<string, Element> = {};
    nodes.forEach((n) => {
      const id = n.getAttribute("data-b-id");
      if (id) byId[id] = n;
    });
    const parent = nodes[0].parentNode;
    let moved = false;
    order.forEach((id) => {
      const n = byId[id];
      if (n && parent) {
        parent.appendChild(n);
        moved = true;
      }
    });
    return moved;
  });
}

export function duplicateSectionInHtml(html: string, id: string): string | null {
  return mutateSectionsHtml(html, (doc) => {
    const nodes = sectionNodesOf(doc);
    const node = nodes.find((n) => n.getAttribute("data-b-id") === id);
    if (!node) return false;
    const clone = node.cloneNode(true) as Element;
    clone.setAttribute("data-b-id", `${id}-copy-${Math.random().toString(36).slice(2, 6)}`);
    node.parentNode?.insertBefore(clone, node.nextSibling);
    return true;
  });
}

export function deleteSectionInHtml(html: string, id: string): string | null {
  return mutateSectionsHtml(html, (doc) => {
    const nodes = sectionNodesOf(doc);
    if (nodes.length <= 1) return false;
    const node = nodes.find((n) => n.getAttribute("data-b-id") === id);
    if (!node) return false;
    node.parentNode?.removeChild(node);
    return true;
  });
}

/* the page-tab order (funnel flow order → nav order → insertion order),
   for the multi-page tab strip. Derived data, not rendering, hence
   included here alongside the other multi-page helpers. */
export type PageTabInfo = { slug: string; label: string; index: number };

export function orderedPageTabs(v: BribleVersion | null): PageTabInfo[] {
  if (!v) return [];
  const pages = bribleVPages(v);
  const slugs = Object.keys(pages);
  const isFunnel = v.blueprint?.kind === "funnel";
  const order = (isFunnel && v.blueprint?.flow?.order) || v.blueprint?.nav?.order || slugs;
  const seen: Record<string, boolean> = {};
  const ordered = order.filter((s) => {
    if (pages[s] && !seen[s]) {
      seen[s] = true;
      return true;
    }
    return false;
  });
  slugs.forEach((s) => {
    if (!seen[s]) {
      ordered.push(s);
      seen[s] = true;
    }
  });
  return ordered.map((slug, i) => {
    const meta = v.blueprint?.pages?.find((p) => p.slug === slug);
    const name = meta?.name || (slug === "home" ? "Home" : cap(slug));
    return { slug, label: isFunnel ? `${i + 1}. ${name}` : name, index: i };
  });
}

/* ---- automatic AI images: image <img> slots the AI shell/page HTML
   tags with data-b-gen-prompt/data-b-img-id for later enhancement. ---- */
export function imageSlots(html: string): { id: string; prompt: string }[] {
  const doc = parseHtmlDoc(html);
  if (!doc) return [];
  return Array.from(doc.querySelectorAll("img[data-b-gen-prompt]"))
    .map((img) => ({ id: img.getAttribute("data-b-img-id") || "", prompt: img.getAttribute("data-b-gen-prompt") || "" }))
    .filter((s) => s.id && s.prompt);
}

export function applyImageSlotUrls(html: string, updates: { id: string; url: string }[]): string | null {
  return mutateSectionsHtml(html, (doc) => {
    let changed = false;
    updates.forEach((u) => {
      let img: Element | null = null;
      try {
        img = doc.querySelector(`img[data-b-img-id="${CSS.escape(u.id)}"]`);
      } catch {
        img = null;
      }
      if (img) {
        img.setAttribute("src", u.url);
        changed = true;
      }
    });
    return changed;
  });
}

/* ---- SEO files, built at publish time from the pages actually uploaded ---- */
export function buildSitemap(urls: string[]): string {
  const body = urls.map((u) => `  <url><loc>${u.replace(/&/g, "&amp;")}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildRobots(indexUrl: string): string {
  const sitemapUrl = indexUrl.replace(/\/index\.html?$/i, "/sitemap.xml");
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

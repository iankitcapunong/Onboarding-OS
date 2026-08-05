"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { useActivityLog } from "./useActivityLog";
import { useCredits } from "./useCredits";
import { useMemory } from "./useMemory";
import { useToast } from "@/components/app/ToastProvider";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
// EdgeFunctionError is still needed: enhanceImages() calls the imagegen
// service, which is unrelated to the removed brible AI pipeline.
import { callImagegen, EdgeFunctionError } from "@/lib/edgeFunctions";
import { buildWebsiteHTML, resolveCreativeCtx, type CreativeCtx, type CreativeFields } from "@/lib/creativeBuilders";
import type { CapturedFields } from "@/lib/assetTemplates";
import type { Asset } from "./useAssets";
import {
  BRIBLE_HELP,
  applyImageSlotUrls,
  bribleActive,
  bribleFallbackSpec,
  bribleIsMultiPage,
  bribleParse,
  bribleVActiveSlug,
  bribleVPages,
  bribleWelcomeText,
  buildRobots,
  buildSitemap,
  concurrentMap,
  deleteSectionInHtml,
  duplicateSectionInHtml,
  emptyBribleState,
  imageSlots,
  makeVersion,
  moveSectionInHtml,
  orderedPageTabs,
  replaceTextInHtml,
  reorderSectionsInHtml,
  sectionOutlineFromHtml,
  setToken,
  specToWebsiteOpts,
  type BribleChatMessage,
  type BribleGenOutput,
  type BriblePages,
  type BribleSelection,
  type BribleSpec,
  type BribleState,
  type BribleVersion,
  type GenStep,
  type GenStepState,
  type PageTabInfo,
  type SectionOutlineItem,
} from "@/lib/bribleEngine";

/* ============================================================
   BRIBLE. AI website builder (Lovable-style) — state/generation-engine
   layer only. Direct replacement for js/app.js's BRIBLE section (lines
   3858-5398): everything non-DOM (state shape, the local template
   fallback, the AI blueprint→shell→pages pipeline, versions, publish,
   design-token/section/inline-text editing on stored HTML strings).
   The DOM-rendering half (preview iframe, chat log DOM, design-mode
   panel markup, home/community gallery) is Part 2's job, built against
   this hook as the interface contract — see BRIBLE_ENGINE_API.md.

   NOTE for whoever wires this up: BribleProvider is NOT added to
   src/app/app/layout.tsx yet (this task deliberately left that alone
   to avoid racing an edit against Part 2/the UI work) — add it there,
   nested like the other feature providers (after MemoryProvider, since
   it depends on useMemory/useCredits/useActivityLog/useAuth). ============================================================ */

type Supa = ReturnType<typeof createClient>;

/* ---- local creatives-library entry: mirrors src/components/creative/
   CreativeModal.tsx's `Creative` type structurally (kind "website") —
   duplicated here instead of imported so this hook doesn't depend on a
   UI component module. Objects built to this shape are assignable to
   `Creative` wherever Part 2 reads them back out of storage. ---- */
type BribleCreativeEntry = {
  id: string;
  kind: "website";
  session: string;
  ts: number;
  source: "call" | "memory" | "demo";
  theme: string;
  details: CreativeFields;
  html: string;
};

/* ---- imagegen: same kie.ai "jobs" API the Image Studio route uses
   (src/app/app/images/page.tsx), called through the shared callImagegen
   edge-function wrapper. Direct replacement for js/imagegen-shared.js's
   window.bslGenImage(prompt, opts) -> Promise<string>, which the
   original bribleEnhanceImages() called as a global. Model/poll timing
   ported verbatim. ---- */
const IMAGEGEN_MODEL = "nano-banana-pro";
const IMAGEGEN_POLL_MS = 3500;
const IMAGEGEN_POLL_TIMEOUT_MS = 3 * 60 * 1000;

type KieJobEnvelope = {
  code?: number;
  msg?: string;
  data?: { taskId?: string; state?: string; resultJson?: string; failMsg?: string };
  _bslRemaining?: number;
};

/* Module-level (not nested in the component) so calling Date.now() from
   the poll loop isn't flagged as an impurity inside render — these are
   only ever invoked from enhanceImages(), itself only reachable from a
   user/generation-triggered action, never from render. */
async function genBribleImage(
  supabase: Supa,
  onCredits: (remaining: number) => void,
  prompt: string,
  opts: { ratio?: string; res?: string }
): Promise<string> {
  const ratio = opts.ratio || "16:9";
  const res = opts.res || "1K";
  const body = { model: IMAGEGEN_MODEL, input: { prompt, aspect_ratio: ratio, resolution: res, output_format: "png" } };
  const j = await callImagegen<KieJobEnvelope>(supabase, "POST", "/api/v1/jobs/createTask", body);
  if (j && typeof j._bslRemaining === "number") onCredits(j._bslRemaining);
  const taskId = j?.data?.taskId;
  if (!j || j.code !== 200 || !taskId) throw new Error((j && j.msg) || "The image service rejected the request");
  return pollBribleImage(supabase, taskId, Date.now());
}

async function pollBribleImage(supabase: Supa, taskId: string, startTs: number): Promise<string> {
  const path = `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
  const j = await callImagegen<KieJobEnvelope>(supabase, "GET", path);
  if (!j || j.code !== 200) throw new Error((j && j.msg) || "Status check failed");
  const d = j.data || {};
  if (d.state === "success") {
    let rj: Record<string, unknown> = {};
    try {
      rj = JSON.parse(d.resultJson || "{}") as Record<string, unknown>;
    } catch {
      rj = {};
    }
    const nested = (rj.result || {}) as Record<string, unknown>;
    const urls = (rj.resultUrls as string[] | undefined) || (nested.resultUrls as string[] | undefined) || [];
    if (!urls.length) throw new Error("No image returned");
    return urls[0];
  }
  if (d.state === "fail") throw new Error(d.failMsg || "Generation failed");
  if (Date.now() - startTs > IMAGEGEN_POLL_TIMEOUT_MS) throw new Error("Timed out waiting for the image");
  await new Promise((resolve) => setTimeout(resolve, IMAGEGEN_POLL_MS));
  return pollBribleImage(supabase, taskId, startTs);
}

/* ---- public interface contract — see BRIBLE_ENGINE_API.md for the
   documented version of this same shape. ---- */
export type BribleContextValue = {
  /** All saved versions, oldest first (capped at the most recent 15). */
  versions: BribleVersion[];
  /** The currently active version (falls back to the last version if activeId is stale/missing), or null before any build. */
  activeVersion: BribleVersion | null;
  /** state.activeId, exposed raw for convenience. */
  activeVersionId: string | null;
  /** Persisted chat transcript. A `{role:"bot", text:"welcome"}` entry is a sentinel — render it via `welcomeText`, not literally. */
  chat: BribleChatMessage[];
  /** The local template engine's current spec (theme/sections/overrides), or null if nothing has used the local path yet. */
  spec: BribleSpec | null;
  /** User-set project name (bribleProjName), or null if never renamed. */
  projectName: string | null;
  /** The version id last saved to Assets/Creative ads via saveToLibraries, or null. */
  savedVersionId: string | null;
  /** Resolved generation context (live call capture > active client memory > demo), same priority as every other AI feature in this app. */
  ctx: CreativeCtx;
  /** Personalized greeting text for the chat's sentinel "welcome" entries — recompute this each render since ctx can change. */
  welcomeText: string;
  /** Section outline (id/type/label) of the active page, for a move/duplicate/delete panel. */
  sectionOutline: SectionOutlineItem[];
  /** Ordered page tabs (funnel-flow order, then nav order, then insertion order) for the active version's pages. */
  pageTabs: PageTabInfo[];
  /** The element the user clicked in the preview while Edit mode is on (set by Part 2's postMessage listener). When set, the next sendMessage() call is treated as replacement text for this element instead of a generation instruction. */
  selection: BribleSelection | null;
  /** Site-scope vs page-scope edit selector (mirrors the #bribleScope <select> in the original). "auto" detects from the instruction text. */
  scope: "auto" | "page" | "site";
  /** True while sendMessage/generateLocal is running (guards re-entrancy; drives a chat "typing" indicator). */
  generating: boolean;
  /** Live step-by-step progress for the AI pipeline (blueprint/shell/each page), in insertion order. Empty outside of an active AI generation. */
  genProgress: GenStep[];
  /** True while publish() is uploading to Supabase Storage. */
  publishing: boolean;

  /** Main chat entry point: decides local-fallback vs AI, site-scope vs page-scope, or "apply this as the selected element's new text" if `selection` is set. Spends `brible` credits (same cost regardless of path). Never throws — failures are reported as a bot chat message. */
  sendMessage: (text: string) => Promise<void>;
  /** Explicit instant/offline-capable local-engine build, skipping the AI call entirely (bribleParse/bribleFallbackSpec + buildWebsiteHTML). Still spends credits, matching the original's unconditional spendCredits() call site. */
  generateLocal: (text: string) => Promise<void>;
  /** Switches the active version (and restores its spec, if any) by id. No-op if the id isn't found. */
  setActiveVersion: (id: string) => void;
  /** Resets the whole Brible project (spec/versions/chat) back to empty. Part 2 should confirm with the user before calling this (the original used a native confirm()). */
  newSite: () => void;
  /** Part 2 addition (see BRIBLE_ENGINE_API.md's known-simplification #1): resets the project (like newSite()) and seeds a single version from an arbitrary {ctx, spec} pair — the community-remix flow. `ctx` becomes the active context override for this project (subsequent edits keep generating against it) until newSite() clears it. `name` is the template's display name, used for the version prompt/chat message. */
  remixTemplate: (ctx: CreativeFields, spec: BribleSpec, name: string) => void;
  /** Part 2 addition: switches which page of the active (multi-page) version is "active" — wire to the page-tab strip. Unlike setActiveVersion, this mutates the stored activeSlug of the current version in place (no new version), so subsequent page-scope edits target the clicked page. No-op if the slug doesn't exist on the active version or is already active. */
  setActivePage: (slug: string) => void;
  /** Renames the project (trimmed, capped at 60 chars). No-op on an empty name. */
  renameProject: (name: string) => void;
  /** Sets/replaces the current inline-edit selection. */
  setSelection: (sel: BribleSelection | null) => void;
  /** Clears the current inline-edit selection. */
  clearSelection: () => void;
  /** Sets the site/page edit-scope selector. */
  setScope: (scope: "auto" | "page" | "site") => void;
  /** Applies a design-token (CSS custom property) change across the shell + every page of the active version, instantly (no AI call), and pushes a new version. No-op if there's no active version/shell. */
  applyToken: (varName: string, value: string) => void;
  /** Moves a section up/down (-1/1) within the active page. Shows a toast and no-ops at the array boundary. */
  moveSection: (id: string, dir: -1 | 1) => void;
  /** Reorders all sections of the active page to match `order` (a full or partial list of section ids). Silently no-ops if nothing moved. */
  reorderSections: (order: string[]) => void;
  /** Duplicates a section within the active page. Shows a toast and no-ops if the section isn't found. */
  duplicateSection: (id: string) => void;
  /** Deletes a section from the active page. Shows a toast and no-ops if it's the last remaining section. */
  deleteSection: (id: string) => void;
  /** Background, non-blocking: fills any AI-image placeholder slots (img[data-b-gen-prompt]) on the given page slug with real generated art, pushing a new version if any succeeded. Automatically fired (fire-and-forget) for newly-created pages after a site-scope generation — also callable directly. */
  enhanceImages: (slug: string) => Promise<void>;
  /** Uploads every page of the active version to Supabase Storage's "sites" bucket (public), writes sitemap.xml/robots.txt, and posts the live link to chat. Never throws — returns null and posts a chat message with (bucket-setup) guidance on failure. */
  publish: () => Promise<{ url: string; failed: string[] } | null>;
  /** Saves the active version into both the Assets and Creative ads libraries (localStorage keys shared with useAssets/the Creative ads route — see the file-level note on this function for the cross-hook caveat). Returns false (with an optional toast) if there's nothing to save or it's already saved. */
  saveToLibraries: (quiet?: boolean) => boolean;
};

const BribleContext = createContext<BribleContextValue | null>(null);

export function BribleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { spendCredits, syncCreditsFromServer } = useCredits();
  const { activeClient, clients, rememberPref } = useMemory();
  const toast = useToast();
  const [supabase] = useState<Supa>(() => createClient());

  const email = (user?.email || "").toLowerCase();
  const bribleKey = scopedKey("bsl_brible", email);
  const callKey = scopedKey("bsl_last_call", email);
  const creativesKey = scopedKey("bsl_creatives", email);
  const assetsKey = scopedKey("bsl_assets", email);

  const [state, setState] = useState<BribleState>(() => {
    const stored = getJSON<BribleState>(bribleKey);
    if (stored && Array.isArray(stored.versions)) return stored;
    return emptyBribleState();
  });
  // Mirrors `state` synchronously for use inside async multi-step flows
  // (sendMessage's AI pipeline, publish) where relying on the `state`
  // closure captured at call-start would go stale — same pattern as
  // useCallCapture's callRef/logsRef.
  const stateRef = useRef(state);

  const [selection, setSelectionState] = useState<BribleSelection | null>(null);
  const [scope, setScope] = useState<"auto" | "page" | "site">("auto");
  const [generating, setGenerating] = useState(false);
  const generatingRef = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const [genProgress, setGenProgress] = useState<GenStep[]>([]);
  const genStepsRef = useRef<GenStep[]>([]);
  const seededRef = useRef(false);

  /* ---- persistence: mirrors bribleSave()'s quota-exceeded fallback
     (trim to the last 5 versions and retry once) — setJSON() alone
     swallows the error without telling us it happened, so this writes
     directly via localStorage.setItem to detect and recover from it. ---- */
  const persistState = useCallback(
    (next: BribleState): BribleState => {
      if (typeof window === "undefined") return next;
      try {
        window.localStorage.setItem(bribleKey, JSON.stringify(next));
        return next;
      } catch {
        const trimmed: BribleState = { ...next, versions: next.versions.slice(-5) };
        try {
          window.localStorage.setItem(bribleKey, JSON.stringify(trimmed));
          return trimmed;
        } catch {
          return next;
        }
      }
    },
    [bribleKey]
  );

  const applyState = useCallback(
    (next: BribleState): BribleState => {
      const persisted = persistState(next);
      stateRef.current = persisted;
      setState(persisted);
      return persisted;
    },
    [persistState]
  );

  // First-ever load: seed the sentinel "welcome" chat entry, matching
  // the original's unconditional bribleWelcome()+chat.push() on script
  // load when brb.chat is empty.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (!stateRef.current.chat.length) {
      applyState({ ...stateRef.current, chat: [{ role: "bot", text: "welcome" }] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMessage = useCallback(
    (role: "user" | "bot", text: string) => {
      const chat = [...stateRef.current.chat, { role, text }];
      applyState({ ...stateRef.current, chat: chat.length > 60 ? chat.slice(-60) : chat });
    },
    [applyState]
  );

  /* ---- generation context: live call capture > active client memory
     > demo, same as every other AI feature (resolveCreativeCtx, shared
     with Creative Ads/Assets). Computed fresh every render so actions
     always see the latest call/memory data at the moment they're invoked. ---- */
  const latestCallContext = useCallback((): CapturedFields | null => {
    const call = getJSON<{ summary?: CapturedFields }>(callKey);
    const s = call?.summary;
    if (!s) return null;
    const hasAny = (["business", "offer", "audience", "goal", "voice"] as const).some((k) => (s[k] || "").trim());
    return hasAny ? s : null;
  }, [callKey]);

  const live = latestCallContext();
  /* community remix override: mirrors the original's bribleCtx() —
     brb.ctx (here state.ctxOverride), when set, wins over the live
     call/memory/demo resolution used everywhere else in the app. Set by
     remixTemplate(), cleared by newSite(). */
  const ctxOverride = state.ctxOverride;
  const ctx: CreativeCtx = useMemo(
    () => (ctxOverride ? { ...ctxOverride, _fromCall: false, _fromMemory: false } : resolveCreativeCtx(live, activeClient)),
    [ctxOverride, live, activeClient]
  );
  const welcomeText = bribleWelcomeText(ctx);

  const activeVersion = useMemo(() => bribleActive(state), [state]);

  const sectionOutline: SectionOutlineItem[] = useMemo(() => {
    if (!activeVersion) return [];
    const slug = bribleVActiveSlug(activeVersion);
    if (!slug) return [];
    const html = bribleVPages(activeVersion)[slug];
    if (!html) return [];
    const bpPage = activeVersion.blueprint?.pages?.find((p) => p.slug === slug);
    return sectionOutlineFromHtml(html, bpPage?.sections);
  }, [activeVersion]);

  const pageTabs: PageTabInfo[] = useMemo(() => orderedPageTabs(activeVersion), [activeVersion]);

  const setSelection = useCallback((sel: BribleSelection | null) => setSelectionState(sel), []);
  const clearSelection = useCallback(() => setSelectionState(null), []);

  /* ---- versions: append, cap history at 15, set active, mirror spec,
     log activity, remember the client's style preference. ---- */
  const pushVersionAction = useCallback(
    (prompt: string, out: BribleGenOutput): BribleVersion => {
      const version = makeVersion(prompt, out, stateRef.current.spec);
      const versions = [...stateRef.current.versions, version];
      if (versions.length > 15) versions.shift();
      const nextSpec = out.spec ? (JSON.parse(JSON.stringify(out.spec)) as BribleSpec) : stateRef.current.spec;
      applyState({ ...stateRef.current, versions, activeId: version.id, spec: nextSpec });

      const versionCount = versions.length;
      logActivity(
        "brible",
        (versionCount === 1 ? "Brible built a site" : `Brible updated the site to v${versionCount}`) +
          (version.themeKey ? ` · ${version.themeKey}` : "") +
          (prompt ? ` · “${String(prompt).slice(0, 50)}”` : "")
      );
      if ((ctx._fromCall || ctx._fromMemory) && version.themeKey && version.themeKey !== "AI") {
        rememberPref(ctx.business, "themeKey", version.themeKey);
      }
      return version;
    },
    [applyState, logActivity, ctx, rememberPref]
  );

  /* ---- the site builder: a deterministic, client-side template engine.
     Brible's AI path (blueprint -> shell -> per-page generation through
     the `brible` Edge Function) was removed — it kept dying on
     Supabase's function resource limits (HTTP 546) and charged 50
     credits per underlying call while doing it. This engine renders
     instantly, costs nothing, and needs no server. ---- */
  const localFallback = useCallback(
    (text: string, c: CreativeCtx, firstBuild: boolean) => {
      const parsed = bribleParse(stateRef.current.spec, text);
      const spec = parsed ? parsed.spec : bribleFallbackSpec(stateRef.current.spec, text);
      if (firstBuild && !spec.themeKey && (c._fromCall || c._fromMemory)) {
        const remembered = clients.find((m) => m.key === (c.business || "").toLowerCase());
        if (remembered?.themeKey) spec.themeKey = remembered.themeKey;
      }
      const out = buildWebsiteHTML(c, specToWebsiteOpts(spec));
      pushVersionAction(text, out);

      let reply: string;
      if (firstBuild) {
        reply = `Here's the first version of the ${c.business} site. Built in the ${out.theme} style${
          c._fromCall ? " from your onboarding call" : ""
        }. Tell me what to change: colors, sections, headline, anything. When you're happy, hit Publish.`;
      } else if (parsed) {
        reply = `Done. ${parsed.changes.join(", ")}. Saved as v${stateRef.current.versions.length}.`;
      } else {
        reply = `I don't have a specific rule for that yet, so I folded it straight into the messaging instead of leaving the site unchanged. Saved as v${stateRef.current.versions.length}. ${BRIBLE_HELP}`;
      }
      addMessage("bot", reply);
    },
    [clients, pushVersionAction, addMessage]
  );

  /* ---- inline text editing: h1/CTA map to spec overrides for
     single-page local-engine sites; everything else (and every
     multi-page AI site) falls through to a direct text replace in the
     active page's HTML. ---- */
  const applySelEditInternal = useCallback(
    (sel: BribleSelection, newText: string, c: CreativeCtx): boolean => {
      const v = bribleActive(stateRef.current);
      if (!v) return false;
      const multi = bribleIsMultiPage(v);

      if (sel.tag === "h1" && stateRef.current.spec && !multi) {
        const spec = JSON.parse(JSON.stringify(stateRef.current.spec)) as BribleSpec;
        spec.overrides = { ...spec.overrides, headline: newText };
        pushVersionAction("Edit headline", buildWebsiteHTML(c, specToWebsiteOpts(spec)));
        return true;
      }
      if ((sel.tag === "a" || sel.tag === "button") && /btn/.test(sel.cls) && stateRef.current.spec && !multi) {
        const spec = JSON.parse(JSON.stringify(stateRef.current.spec)) as BribleSpec;
        spec.overrides = { ...spec.overrides, cta: newText };
        pushVersionAction("Edit button", buildWebsiteHTML(c, specToWebsiteOpts(spec)));
        return true;
      }

      const slug = bribleVActiveSlug(v);
      if (!slug) return false;
      const pages = bribleVPages(v);
      const pageHtml = pages[slug] || v.html;
      const newPageHtml = replaceTextInHtml(pageHtml, sel.text, newText);
      if (newPageHtml == null) return false;
      const newPages = { ...pages, [slug]: newPageHtml };
      pushVersionAction("Edit text", {
        html: newPageHtml,
        theme: v.themeKey,
        spec: stateRef.current.spec,
        blueprint: v.blueprint,
        shellHtml: v.shellHtml,
        pages: newPages,
        activeSlug: slug,
      });
      return true;
    },
    [pushVersionAction]
  );

  /* ---- AI pipeline: blueprint-first, multi-page generation. plan
     (mode:"blueprint") -> shared nav/footer/design-token shell
     (mode:"shell") -> each page's full HTML document (mode:"page"),
     pages run with bounded concurrency (pool of 3). ---- */
  const reportStep = useCallback((key: string, label: string, stepState: GenStepState) => {
    const list = genStepsRef.current;
    const idx = list.findIndex((s) => s.key === key);
    const nextList = idx === -1 ? [...list, { key, label, state: stepState }] : list.map((s, i) => (i === idx ? { key, label, state: stepState } : s));
    genStepsRef.current = nextList;
    setGenProgress(nextList);
  }, []);

  const resetGenProgress = useCallback(() => {
    genStepsRef.current = [];
    setGenProgress([]);
  }, []);

  const enhanceImages = useCallback(
    async (slug: string) => {
      const v0 = bribleActive(stateRef.current);
      if (!v0) return;
      const html0 = bribleVPages(v0)[slug];
      if (!html0) return;
      const slots = imageSlots(html0);
      if (!slots.length) return;

      const results = await concurrentMap(slots, 2, async (slot) => {
        try {
          const url = await genBribleImage(supabase, syncCreditsFromServer, slot.prompt, { ratio: "16:9", res: "1K" });
          return { id: slot.id, url };
        } catch (err) {
          if (err instanceof EdgeFunctionError && err.code === "out_of_credits") syncCreditsFromServer(err.remaining ?? 0);
          return null;
        }
      });
      const ok = results.filter((r): r is { id: string; url: string } => r !== null);
      if (!ok.length) return;

      const v = bribleActive(stateRef.current);
      if (!v) return;
      const pages = bribleVPages(v);
      const pageHtml = pages[slug];
      if (!pageHtml) return;
      const newHtml = applyImageSlotUrls(pageHtml, ok);
      if (newHtml == null) return;
      const newPages = { ...pages, [slug]: newHtml };
      pushVersionAction(`AI images for ${slug}`, {
        blueprint: v.blueprint,
        shellHtml: v.shellHtml,
        pages: newPages,
        activeSlug: v.activeSlug,
        theme: v.themeKey,
        html: newPages[v.activeSlug],
        spec: v.spec,
      });
      addMessage(
        "bot",
        `${
          ok.length < slots.length
            ? `${ok.length} of ${slots.length} image${slots.length === 1 ? "" : "s"}`
            : `All ${ok.length} image${ok.length === 1 ? "" : "s"}`
        } on the ${slug} page upgraded with AI-generated art.`
      );
    },
    [pushVersionAction, addMessage, supabase, syncCreditsFromServer]
  );

  /* ---- main chat orchestrator: local-fallback vs AI, site-scope vs
     page-scope, or "apply as replacement text for the selected
     element" if an inline-edit selection is active. ---- */
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (generatingRef.current) return;
      // No credit charge: building is local now, so there's no upstream
      // API call to pay for. (It used to spend 50 — the AI tier.)

      addMessage("user", trimmed);
      generatingRef.current = true;
      setGenerating(true);
      resetGenProgress();

      const c = ctx;

      try {
        if (selection && stateRef.current.versions.length) {
          const sel = selection;
          setSelectionState(null);
          const applied = applySelEditInternal(sel, trimmed, c);
          if (applied) {
            addMessage(
              "bot",
              `Done. Replaced “${sel.text.slice(0, 40)}${sel.text.length > 40 ? "…" : ""}” with “${trimmed.slice(0, 40)}”. Saved as v${
                stateRef.current.versions.length
              }.`
            );
          } else {
            addMessage(
              "bot",
              `I couldn't apply that edit directly to the selected element. Try rephrasing it as an instruction, e.g. “change the headline to "${trimmed.slice(
                0,
                40
              )}"”.`
            );
          }
          return;
        }

        const firstBuild = !stateRef.current.versions.length;
        reportStep("local", "Building the site…", "active");
        try {
          localFallback(trimmed, c, firstBuild);
          reportStep("local", "Building the site…", "done");
        } catch {
          reportStep("local", "Building the site…", "error");
        }
      } finally {
        generatingRef.current = false;
        setGenerating(false);
      }
    },
    [
      ctx,
      selection,
      addMessage,
      resetGenProgress,
      localFallback,
      applySelEditInternal,
      reportStep,
    ]
  );

  /* ---- explicit local/offline fast path: skips the AI call entirely,
     matching the original's `!SB` branch. Still spends credits (the
     original's spendCredits() call happens before the SB check). ---- */
  const generateLocal = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (generatingRef.current) return;
      if (!spendCredits("brible", 1)) return;

      addMessage("user", trimmed);
      generatingRef.current = true;
      setGenerating(true);
      resetGenProgress();
      reportStep("local", "Building instantly with the local engine…", "active");
      try {
        const firstBuild = !stateRef.current.versions.length;
        localFallback(trimmed, ctx, firstBuild);
        reportStep("local", "Building instantly with the local engine…", "done");
      } catch {
        reportStep("local", "Building instantly with the local engine…", "error");
      } finally {
        generatingRef.current = false;
        setGenerating(false);
      }
    },
    [ctx, spendCredits, addMessage, resetGenProgress, reportStep, localFallback]
  );

  const setActiveVersion = useCallback(
    (id: string) => {
      const v = stateRef.current.versions.find((x) => x.id === id);
      if (!v) return;
      applyState({
        ...stateRef.current,
        activeId: id,
        spec: v.spec ? (JSON.parse(JSON.stringify(v.spec)) as BribleSpec) : stateRef.current.spec,
      });
    },
    [applyState]
  );

  const newSite = useCallback(() => {
    applyState({ spec: null, activeId: null, versions: [], chat: [{ role: "bot", text: "welcome" }], name: null, savedId: null });
  }, [applyState]);

  /* ---- Part 2 addition: community-template remix. Not in the original
     Part 1 contract (see BRIBLE_ENGINE_API.md's "known simplifications"
     #1) — the state-logic equivalent of the original's bribleRemix():
     resets the whole project (like newSite()) then seeds a version from
     an arbitrary {ctx, spec} pair unrelated to the hook's own
     live-derived ctx, via buildWebsiteHTML + makeVersion. `ctx` is
     stored as ctxOverride so subsequent chat edits keep generating
     against the template's business, not the real onboarding call/memory
     (matching the original's `brb.ctx` persisting until New/newSite()). ---- */
  const remixTemplate = useCallback(
    (c: CreativeFields, spec: BribleSpec, name: string) => {
      const out = buildWebsiteHTML(c, specToWebsiteOpts(spec));
      const version = makeVersion(`Remix: ${name}`, out, spec);
      applyState({
        spec: version.spec,
        activeId: version.id,
        versions: [version],
        chat: [
          { role: "bot", text: "welcome" },
          { role: "bot", text: `Remixed “${name}”. It's yours now. Restyle it, change sections or copy, and hit Publish when you're happy.` },
        ],
        name: null,
        savedId: null,
        ctxOverride: c,
      });
      logActivity("brible", `Brible built a site${version.themeKey ? ` · ${version.themeKey}` : ""} · “Remix: ${name}”`.slice(0, 120));
    },
    [applyState, logActivity]
  );

  /* ---- Part 2 addition: switches which page of a multi-page version is
     "active" (the brible-pagetabs strip) without creating a new version
     — mirrors the original's direct `v.activeSlug = slug; bribleSave();`
     mutation. Not in the original Part 1 contract: nothing else in that
     contract exposed a way to change a *stored* version's activeSlug
     (only setActiveVersion, which switches to a different version
     entirely), and page-scope edits (generatePageAI) key off exactly
     this field via bribleVActiveSlug(), so without it a page-tab click
     couldn't actually retarget subsequent chat edits to the clicked page. ---- */
  const setActivePage = useCallback(
    (slug: string) => {
      const v = bribleActive(stateRef.current);
      if (!v) return;
      const pages = bribleVPages(v);
      if (!pages[slug] || v.activeSlug === slug) return;
      const versions = stateRef.current.versions.map((x) => (x.id === v.id ? { ...x, activeSlug: slug } : x));
      applyState({ ...stateRef.current, versions });
    },
    [applyState]
  );

  const renameProject = useCallback(
    (name: string) => {
      const trimmed = name.trim().slice(0, 60);
      if (!trimmed) return;
      applyState({ ...stateRef.current, name: trimmed });
    },
    [applyState]
  );

  /* ---- design tokens / section editing: pure HTML-string ops from
     bribleEngine.ts, applied to the active version and pushed as a new
     version, same as every other edit. ---- */
  const applyToken = useCallback(
    (varName: string, value: string) => {
      const v = bribleActive(stateRef.current);
      if (!v || !v.shellHtml || !value) return;
      const newShell = setToken(v.shellHtml, varName, value);
      const pages = bribleVPages(v);
      const newPages: BriblePages = {};
      Object.keys(pages).forEach((slug) => {
        newPages[slug] = setToken(pages[slug], varName, value);
      });
      const activeSlug = bribleVActiveSlug(v);
      if (!activeSlug) return;
      pushVersionAction(`Theme: ${varName.replace("--b-", "")}`, {
        blueprint: v.blueprint,
        shellHtml: newShell,
        pages: newPages,
        activeSlug,
        theme: v.themeKey,
        html: newPages[activeSlug],
        spec: v.spec,
      });
    },
    [pushVersionAction]
  );

  const moveSection = useCallback(
    (id: string, dir: -1 | 1) => {
      const v = bribleActive(stateRef.current);
      if (!v) return;
      const slug = bribleVActiveSlug(v);
      if (!slug) return;
      const pages = bribleVPages(v);
      const html = pages[slug];
      if (!html) return;
      const newHtml = moveSectionInHtml(html, id, dir);
      if (newHtml == null) {
        toast("Can't move that section further");
        return;
      }
      const newPages = { ...pages, [slug]: newHtml };
      pushVersionAction("Reordered sections", {
        blueprint: v.blueprint,
        shellHtml: v.shellHtml,
        pages: newPages,
        activeSlug: slug,
        theme: v.themeKey,
        html: newHtml,
        spec: v.spec,
      });
    },
    [pushVersionAction, toast]
  );

  const reorderSections = useCallback(
    (order: string[]) => {
      const v = bribleActive(stateRef.current);
      if (!v) return;
      const slug = bribleVActiveSlug(v);
      if (!slug) return;
      const pages = bribleVPages(v);
      const html = pages[slug];
      if (!html) return;
      const newHtml = reorderSectionsInHtml(html, order);
      if (newHtml == null) return;
      const newPages = { ...pages, [slug]: newHtml };
      pushVersionAction("Reordered sections", {
        blueprint: v.blueprint,
        shellHtml: v.shellHtml,
        pages: newPages,
        activeSlug: slug,
        theme: v.themeKey,
        html: newHtml,
        spec: v.spec,
      });
    },
    [pushVersionAction]
  );

  const duplicateSection = useCallback(
    (id: string) => {
      const v = bribleActive(stateRef.current);
      if (!v) return;
      const slug = bribleVActiveSlug(v);
      if (!slug) return;
      const pages = bribleVPages(v);
      const html = pages[slug];
      if (!html) return;
      const newHtml = duplicateSectionInHtml(html, id);
      if (newHtml == null) {
        toast("Couldn't duplicate that section");
        return;
      }
      const newPages = { ...pages, [slug]: newHtml };
      pushVersionAction("Duplicated section", {
        blueprint: v.blueprint,
        shellHtml: v.shellHtml,
        pages: newPages,
        activeSlug: slug,
        theme: v.themeKey,
        html: newHtml,
        spec: v.spec,
      });
    },
    [pushVersionAction, toast]
  );

  const deleteSection = useCallback(
    (id: string) => {
      const v = bribleActive(stateRef.current);
      if (!v) return;
      const slug = bribleVActiveSlug(v);
      if (!slug) return;
      const pages = bribleVPages(v);
      const html = pages[slug];
      if (!html) return;
      const newHtml = deleteSectionInHtml(html, id);
      if (newHtml == null) {
        toast("Can't delete the last remaining section");
        return;
      }
      const newPages = { ...pages, [slug]: newHtml };
      pushVersionAction("Deleted section", {
        blueprint: v.blueprint,
        shellHtml: v.shellHtml,
        pages: newPages,
        activeSlug: slug,
        theme: v.themeKey,
        html: newHtml,
        spec: v.spec,
      });
    },
    [pushVersionAction, toast]
  );

  /* ---- save the active Brible site into BOTH libraries: Assets ->
     Generated assets and Creative ads -> Generated creatives.

     CAVEAT: AssetsProvider (src/hooks/useAssets.tsx) doesn't expose a
     way to add an externally-created Asset to its own React state, and
     there is no shared "useCreatives" hook at all (the Creative Ads
     route keeps its list as page-local state — see that file's own
     comment). This writes directly to the same localStorage keys
     (bsl_assets, bsl_creatives) those routes read on their own mount,
     matching the original's flat-array-plus-save() model exactly — but
     if the Assets or Creative Ads route is already mounted in the same
     tab when this runs, its in-memory list won't pick up the addition
     reactively until it remounts/reloads. Flagging for Part 2 / a
     follow-up: giving AssetsProvider an `addAsset` action (and
     promoting creatives to a real shared hook) would remove this gap. ---- */
  const saveToLibraries = useCallback(
    (quiet = false): boolean => {
      const v = bribleActive(stateRef.current);
      if (!v) {
        if (!quiet) toast("Nothing to save yet. Build a site first");
        return false;
      }
      if (stateRef.current.savedId === v.id) {
        if (!quiet) toast("This version is already saved");
        return false;
      }

      const c = ctx;
      const details: CreativeFields = { business: c.business, offer: c.offer, audience: c.audience, goal: c.goal, voice: c.voice };
      const source: "call" | "memory" | "demo" = c._fromCall ? "call" : c._fromMemory ? "memory" : "demo";
      const sessionLabel = c._fromCall || c._fromMemory ? c.business : "";

      const existingCreatives = getJSON<BribleCreativeEntry[]>(creativesKey) || [];
      const newCreative: BribleCreativeEntry = {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "website",
        session: sessionLabel,
        ts: Date.now(),
        source,
        theme: v.themeKey,
        details,
        html: v.html,
      };
      setJSON(creativesKey, [newCreative, ...existingCreatives]);

      const existingAssets = getJSON<Asset[]>(assetsKey) || [];
      const newAsset: Asset = {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "Website",
        session: sessionLabel,
        ts: Date.now(),
        source,
        details,
        html: v.html,
        theme: v.themeKey,
      };
      setJSON(assetsKey, [newAsset, ...existingAssets]);

      applyState({ ...stateRef.current, savedId: v.id });
      logActivity("brible", "Saved the Brible site to Assets & Creative ads");
      if (!quiet) toast("Saved to Generated assets & Creative ads", true);
      return true;
    },
    [ctx, creativesKey, assetsKey, applyState, logActivity, toast]
  );

  /* ---- publish: upload every page to Supabase Storage -> live public
     URL, plus best-effort sitemap.xml/robots.txt. The one place in
     Brible that talks to Supabase Storage directly rather than through
     an Edge Function, matching the original. ---- */
  const publish = useCallback(async (): Promise<{ url: string; failed: string[] } | null> => {
    const v = bribleActive(stateRef.current);
    if (!v) {
      toast("Build a site first. Then publish it");
      return null;
    }
    const pages = bribleVPages(v);
    const slugs = Object.keys(pages);
    if (!slugs.length) {
      toast("Build a site first. Then publish it");
      return null;
    }

    setPublishing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const authedUser = data.session?.user;
      if (!authedUser) throw new Error("Sign in to publish");

      const failed: string[] = [];
      const paths = await concurrentMap(slugs, 3, async (slug) => {
        const path = `${authedUser.id}/${slug === "home" ? "index" : slug}.html`;
        const { error } = await supabase.storage
          .from("sites")
          .upload(path, new Blob([pages[slug]], { type: "text/html" }), { upsert: true, contentType: "text/html" });
        if (error) {
          failed.push(slug);
          return null;
        }
        return path;
      });

      const indexPath = `${authedUser.id}/index.html`;
      const url = `${supabase.storage.from("sites").getPublicUrl(indexPath).data.publicUrl}?v=${Date.now()}`;
      const pageUrls: string[] = [];
      paths.forEach((path) => {
        if (path) pageUrls.push(supabase.storage.from("sites").getPublicUrl(path).data.publicUrl);
      });

      const sitemapXml = buildSitemap(pageUrls);
      const robotsTxt = buildRobots(url.split("?")[0]);
      await concurrentMap(
        [
          { name: "sitemap.xml", content: sitemapXml, type: "application/xml" },
          { name: "robots.txt", content: robotsTxt, type: "text/plain" },
        ],
        2,
        async (f) => {
          try {
            await supabase.storage
              .from("sites")
              .upload(`${authedUser.id}/${f.name}`, new Blob([f.content], { type: f.type }), { upsert: true, contentType: f.type });
            return true;
          } catch {
            return null;
          }
        }
      );

      addMessage("bot", `Your site is live: ${url}`);
      if (failed.length) {
        addMessage("bot", `Heads up: ${failed.length} page(s) (${failed.join(", ")}) failed to publish — hit Publish again to retry them.`);
      }
      saveToLibraries(true);
      if (ctx._fromCall || ctx._fromMemory) rememberPref(ctx.business, "publishedUrl", url.split("?")[0]);
      logActivity("publish", `Published the Brible site${slugs.length > 1 ? ` (${slugs.length} pages)` : ""}`);
      toast(failed.length ? "Published with some errors" : "Published. Link posted in the chat", true);
      return { url, failed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Publish failed";
      if (/bucket|not.?found|404/i.test(msg)) {
        addMessage(
          "bot",
          'Publishing needs a one-time setup: in your Supabase dashboard open Storage → New bucket → name it "sites" and set it to Public. Then add a policy allowing authenticated users to insert/update, and hit Publish again.'
        );
      } else {
        addMessage("bot", `Couldn't publish: ${msg}`);
      }
      return null;
    } finally {
      setPublishing(false);
    }
  }, [supabase, toast, ctx, rememberPref, logActivity, saveToLibraries, addMessage]);

  const value = useMemo<BribleContextValue>(
    () => ({
      versions: state.versions,
      activeVersion,
      activeVersionId: state.activeId,
      chat: state.chat,
      spec: state.spec,
      projectName: state.name ?? null,
      savedVersionId: state.savedId ?? null,
      ctx,
      welcomeText,
      sectionOutline,
      pageTabs,
      selection,
      scope,
      generating,
      genProgress,
      publishing,
      sendMessage,
      generateLocal,
      setActiveVersion,
      newSite,
      remixTemplate,
      setActivePage,
      renameProject,
      setSelection,
      clearSelection,
      setScope,
      applyToken,
      moveSection,
      reorderSections,
      duplicateSection,
      deleteSection,
      enhanceImages,
      publish,
      saveToLibraries,
    }),
    [
      state,
      activeVersion,
      ctx,
      welcomeText,
      sectionOutline,
      pageTabs,
      selection,
      scope,
      generating,
      genProgress,
      publishing,
      sendMessage,
      generateLocal,
      setActiveVersion,
      newSite,
      remixTemplate,
      setActivePage,
      renameProject,
      setSelection,
      clearSelection,
      applyToken,
      moveSection,
      reorderSections,
      duplicateSection,
      deleteSection,
      enhanceImages,
      publish,
      saveToLibraries,
    ]
  );

  return <BribleContext.Provider value={value}>{children}</BribleContext.Provider>;
}

export function useBrible() {
  const ctx = useContext(BribleContext);
  if (!ctx) throw new Error("useBrible must be used within BribleProvider");
  return ctx;
}

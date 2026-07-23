# Brible engine — API contract (Part 1 deliverable)

State-management / generation-engine layer for Brible (the AI website
builder). No UI. Built against `js/app.js` lines 3858-5398.

Files:
- `src/hooks/useBrible.tsx` — `BribleProvider` + `useBrible()`. All React state, AI-pipeline orchestration, and Supabase calls.
- `src/lib/bribleEngine.ts` — pure functions/types (no React, no network): spec parsing, multi-page helpers, HTML-string section/token/text manipulation, sitemap/robots, concurrency utility.

**Not wired up yet**: `BribleProvider` is *not* added to `src/app/app/layout.tsx` — that's left for whoever starts the UI work, to avoid racing an edit against it. Nest it like the other feature providers (needs `useAuth`/`useActivityLog`/`useCredits`/`useMemory` above it in the tree).

---

## `useBrible()` return value

### Read state

| Field | Type | Description |
|---|---|---|
| `versions` | `BribleVersion[]` | All saved versions, oldest first (capped at the most recent 15). |
| `activeVersion` | `BribleVersion \| null` | The active version (falls back to the last version if `activeId` is stale), or `null` before any build. |
| `activeVersionId` | `string \| null` | Raw `activeId`. |
| `chat` | `BribleChatMessage[]` | Persisted chat transcript. A `{role:"bot", text:"welcome"}` entry is a sentinel — render it via `welcomeText`, not literally (the original re-personalizes this text each time it's shown, since the underlying call/memory context can change between sessions). |
| `spec` | `BribleSpec \| null` | The local template engine's current spec (theme/sections/overrides). |
| `projectName` | `string \| null` | User-set project name, or `null` if never renamed. |
| `savedVersionId` | `string \| null` | The version id last saved to Assets/Creative ads via `saveToLibraries`, or `null`. |
| `ctx` | `CreativeCtx` | Resolved generation context (live call capture > active client memory > demo) — same priority/shape as every other AI feature in this app. |
| `welcomeText` | `string` | Personalized greeting for the chat's sentinel "welcome" entries. |
| `sectionOutline` | `SectionOutlineItem[]` | `{id, type, label}[]` outline of the active page's top-level sections, for a move/duplicate/delete panel. |
| `pageTabs` | `PageTabInfo[]` | `{slug, label, index}[]`, ordered by funnel-flow order → nav order → insertion order, for a multi-page tab strip. |
| `selection` | `BribleSelection \| null` | The element the user clicked in the preview while Edit mode is on (`{tag, cls, text}`), set via `setSelection`. When set, the next `sendMessage()` call is treated as replacement text for this element instead of a generation instruction. |
| `scope` | `"auto" \| "page" \| "site"` | Site-scope vs page-scope edit selector (mirrors the original's `#bribleScope` `<select>`). `"auto"` detects from the instruction text. |
| `generating` | `boolean` | True while `sendMessage`/`generateLocal` is running. |
| `genProgress` | `GenStep[]` | `{key, label, state: "active"\|"done"\|"error"}[]`, live step-by-step progress for the AI pipeline (blueprint/shell/each page), in insertion order. Empty outside of an active AI generation. |
| `publishing` | `boolean` | True while `publish()` is uploading. |

### Actions

| Action | Signature | Description |
|---|---|---|
| `sendMessage` | `(text: string) => Promise<void>` | Main chat entry point. Decides: apply-to-selected-element (if `selection` is set) → else site-scope vs page-scope AI generation → falls back to the local template engine if the AI call fails or the message doesn't apply directly. Spends `brible` credits (50, matching `CREDIT_COSTS.brible`) regardless of which path runs. Never throws — failures become a bot chat message. |
| `generateLocal` | `(text: string) => Promise<void>` | Explicit instant/offline-capable local-engine build, skipping the AI call entirely (`bribleParse`/`bribleFallbackSpec` → `buildWebsiteHTML`). Still spends credits, matching the original's unconditional `spendCredits()` call site. Useful for a "quick build" action that doesn't wait on the network. |
| `setActiveVersion` | `(id: string) => void` | Switches the active version (and restores its spec, if any). No-op if not found. |
| `newSite` | `() => void` | Resets the whole project (spec/versions/chat) to empty. Part 2 should confirm with the user first (the original used a native `confirm()`) — this action itself doesn't ask. |
| `renameProject` | `(name: string) => void` | Renames the project (trimmed, capped at 60 chars). No-op on empty. |
| `setSelection` | `(sel: BribleSelection \| null) => void` | Sets/replaces the inline-edit selection (wire to the preview iframe's `postMessage` listener). |
| `clearSelection` | `() => void` | Clears the inline-edit selection. |
| `setScope` | `(scope: "auto" \| "page" \| "site") => void` | Sets the edit-scope selector. |
| `applyToken` | `(varName: string, value: string) => void` | Applies a design-token (CSS custom property) change across the shell + every page of the active version, instantly (no AI call), and pushes a new version. No-op if there's no active version/shell. Pair with `DESIGN_TOKENS`/`QUICK_FONTS`/`tokenValue` from `bribleEngine.ts` for a token panel. |
| `moveSection` | `(id: string, dir: -1 \| 1) => void` | Moves a section up/down within the active page. Toasts and no-ops at the boundary. |
| `reorderSections` | `(order: string[]) => void` | Reorders sections of the active page to match `order`. Silently no-ops if nothing moved. |
| `duplicateSection` | `(id: string) => void` | Duplicates a section. Toasts and no-ops if not found. |
| `deleteSection` | `(id: string) => void` | Deletes a section. Toasts and no-ops if it's the last remaining one. |
| `enhanceImages` | `(slug: string) => Promise<void>` | Background, non-blocking: fills AI-image placeholder slots (`img[data-b-gen-prompt]`) on the given page with real generated art, pushing a new version if any succeeded. Auto-fired (fire-and-forget) for newly-created pages after a site-scope generation — also directly callable (e.g. a "regenerate images" button). |
| `publish` | `() => Promise<{url: string; failed: string[]} \| null>` | Uploads every page of the active version to the Supabase Storage `"sites"` bucket (public), writes `sitemap.xml`/`robots.txt`, posts the live link to chat. Never throws — returns `null` and posts a chat message (with bucket-setup guidance on a bucket-not-found error) on failure. |
| `saveToLibraries` | `(quiet?: boolean) => boolean` | Saves the active version into both the Assets and Creative ads libraries. Returns `false` (with an optional toast) if there's nothing to save or it's already saved. **Caveat**: writes directly to the shared `bsl_assets`/`bsl_creatives` localStorage keys rather than through `useAssets`'s React state (see the in-file comment above this function) — a route that's already mounted in the same tab won't see the addition until it remounts/reloads. |

---

## `src/lib/bribleEngine.ts` exports

### Types
- `BribleSpec`, `BribleSectionsFlags`, `BribleOverrides`, `BribleSpecVariant` — the local template engine's per-site config (theme/overlay/sections/overrides), same shape `buildWebsiteHTML` (creativeBuilders.ts) reads/returns.
- `BribleBlueprint`, `BribleBlueprintPage`, `BribleBlueprintSection` — AI-authored blueprint JSON, typed loosely (index signature) since the authoritative shape lives server-side in the `brible` Edge Function.
- `BriblePages` — `Record<string, string>` (slug → full HTML document).
- `BribleVersion` — one saved version (`id, prompt, ts, themeKey, spec, blueprint, shellHtml, pages, activeSlug, html`).
- `BribleChatMessage` — `{role: "user"|"bot", text}`.
- `BribleSelection` — `{tag, cls, text}`, the inline-edit selection.
- `BribleState` — `{spec, activeId, versions, chat, name?, savedId?}`, the full persisted shape (`scopedKey("bsl_brible", email)`).
- `BribleGenOutput` — the shape every generation/edit path (local engine, AI pipeline, token/section edits) produces, consumed by `makeVersion`.
- `GenStep`, `GenStepState` — progress-reporting types.
- `BribleParseResult` — `{spec, changes}` from `bribleParse`.
- `SectionOutlineItem`, `PageTabInfo`, `DesignToken`, `DesignTokenOption` — UI-facing derived-data shapes.

### Functions / constants
- `emptyBribleState()` — fresh `BribleState`.
- `bribleActive(state)`, `bribleVPages(v)`, `bribleVActiveSlug(v)`, `bribleIsMultiPage(v)` — the "one code path regardless of legacy-single-doc vs multi-page-AI-site" helpers, used everywhere.
- `concurrentMap(items, limit, fn)` — generic bounded-concurrency async map (used for page generation and publish uploads).
- `makeVersion(prompt, out, fallbackSpec)` — turns a `BribleGenOutput` into a stamped `BribleVersion`.
- `specToWebsiteOpts(spec)` — adapts a `BribleSpec` (nulls) to `buildWebsiteHTML`'s `WebsiteOpts` (undefineds).
- `bribleParse(currentSpec, text)` / `bribleFallbackSpec(currentSpec, text)` — the local (non-AI) instruction-to-spec engine.
- `BRIBLE_HELP` — canned help text for "I don't have a rule for that" replies.
- `bribleWelcomeText(ctx)` — the personalized chat welcome string.
- `bribleEditScope(text, uiScope)` — site-scope vs page-scope decision.
- `escTextToHtml(s)`, `replaceTextInHtml(html, oldText, newText)` — inline-text-edit string ops.
- `tokenValue(html, varName)`, `setToken(html, varName, value)` — CSS custom-property read/write on a stored HTML string.
- `DESIGN_TOKENS`, `QUICK_FONTS` — the token-panel config data (ported verbatim from `BDP_TOKENS`/`BDP_QUICK_FONTS`).
- `sectionOutlineFromHtml(html, bpSections?)` — derives the section outline from a page's HTML.
- `moveSectionInHtml`, `reorderSectionsInHtml`, `duplicateSectionInHtml`, `deleteSectionInHtml` — structural section edits; each takes an HTML string + params and returns a new HTML string or `null` on failure/no-op. Pure `DOMParser`-based string transforms — never touch a live/attached DOM.
- `orderedPageTabs(v)` — page-tab order + labels for a multi-page version.
- `imageSlots(html)` — extracts `{id, prompt}[]` from `img[data-b-gen-prompt]` elements.
- `applyImageSlotUrls(html, updates)` — writes generated image URLs into those slots; returns `null` if nothing changed.
- `buildSitemap(urls)`, `buildRobots(indexUrl)` — SEO file generation for publish.

---

## Known simplifications / deviations from the original (and why)

1. **Community remix templates / gallery** (`BRIBLE_TPLS`, `bribleRemix`, `bribleRenderGallery`, `bribleRenderCommunity`, home⇄builder view toggling) — **not ported**. The task's spec never called these out among the state logic to port, and they read as home-screen UI/content rather than generation-engine state. If Part 2 wants "remix a template" as a feature, it's a small addition: seed a `BribleState` from a template's `{ctx, spec}` via `buildWebsiteHTML` + the existing `newSite`-style reset, matching the original's `bribleRemix()`.
2. **`saveToLibraries` cross-hook write** — see the caveat in the table above and the in-file comment on `saveToLibraries`. There's no shared "useCreatives" hook and `useAssets` has no external "add" action, so this hook writes directly to the same localStorage keys those routes read on mount. A real fix (giving `AssetsProvider` an `addAsset` action, promoting creatives to a shared hook) is out of scope for this task.
3. **`generateLocal`'s progress feedback** — the original's `!SB` branch faked a multi-second sequence of "Thinking…/Designing the layout…/…" status text purely for perceived-latency UX (via `setTimeout` chains), even though the local engine itself is synchronous and near-instant. This hook does not fake that latency — `generateLocal` reports a single `genProgress` step and resolves as fast as `buildWebsiteHTML` actually runs. Part 2 can layer its own transition/animation on top if that pacing is still wanted.
4. **Publish's live chat link** — the original's `briblePublishMsg()` rendered a special one-time DOM row with a clickable `<a>` and an emoji, but persisted plain text (`"Your site is live: " + url`) to `chat` — on reload, past publish messages render as plain text too (confirmed by the original's own restore path). This hook matches that: `publish()` calls `addMessage("bot", "Your site is live: " + url)` with plain text. Part 2 can pattern-match that prefix to render a clickable link for the live message if wanted, same opportunity the original DOM code took.
5. **Design/Edit mode toggle flags** (`bribleEditOn`/`bribleDesignOn`, the preview-iframe-with-injected-highlight-script, Preview/Code/Edit/Design mode buttons) — **not included**. These are pure view/rendering state (which panel is visible, what gets injected into the iframe's `srcdoc`) with no persistence or generation-logic behind them, so they're Part 2's to own; the *effects* of Edit mode (an active `selection`) are exposed via `selection`/`setSelection`/`clearSelection`.
6. **Download-as-file / open-in-new-tab actions** (`bribleDownload`, `bribleOpen`) — **not included**; these are pure DOM/anchor-click browser actions with no state behind them beyond `activeVersion.pages`, which Part 2 already has.

## Verification performed

- `npx tsc --noEmit` — clean, no errors.
- `npx eslint src/hooks/useBrible.tsx src/lib/bribleEngine.ts --max-warnings=0` — clean, no errors or warnings.
- `npm run build` — succeeds (production build compiles, typechecks, and prerenders all routes, including the existing `/app/brible` placeholder page from Part 2's future route).

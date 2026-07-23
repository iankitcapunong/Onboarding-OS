"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useMemory } from "@/hooks/useMemory";
import { useCredits } from "@/hooks/useCredits";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/components/app/ToastProvider";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";
import { CREATIVE_KINDS, DEMO_CTX, resolveCreativeCtx, type CreativeFields, type CreativeKind } from "@/lib/creativeBuilders";
import type { CapturedFields } from "@/lib/assetTemplates";
import { CreativeIcon } from "@/components/creative/CreativeIcon";
import { CreativeModal, type Creative } from "@/components/creative/CreativeModal";

/* Direct replacement for js/app.js's CREATIVE ADS section (app.html's
   #route-creative + lines 2768-3857 of js/app.js): four generate buttons
   build full HTML documents from onboarding-call/memory context via
   src/lib/creativeBuilders.ts, store them, and open them in a preview
   modal. State lives in this page (no shared Provider) since no other
   route needs the generated-creatives list — unlike Assets, which the
   dashboard also reads from. */

type LastCall = { summary?: CapturedFields };

const KIND_SUB: Record<CreativeKind, string> = {
  landing: "A full page. Hero, benefits, steps and CTA. Written from your offer and goal.",
  funnel: "Ad → landing page → booking, mapped end to end with copy for every step.",
  graphics: "Feed, story, proof and banner mockups styled with your business name and hooks.",
  website: "A complete multi-section site. Hero, services, about, reviews and contact.",
};

const KIND_ORDER: CreativeKind[] = ["landing", "funnel", "graphics", "website"];

const CTX_LABELS: { key: keyof CreativeFields; label: string }[] = [
  { key: "business", label: "Business" },
  { key: "offer", label: "Offer" },
  { key: "audience", label: "Audience" },
  { key: "goal", label: "Goal" },
  { key: "voice", label: "Brand voice" },
];

function whenLabel(cr: Creative) {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(cr.ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(cr.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CreativeAdsPage() {
  const { user } = useAuth();
  const { activeClient } = useMemory();
  const { spendCredits } = useCredits();
  const { logActivity } = useActivityLog();
  const toast = useToast();
  const email = (user?.email || "").toLowerCase();
  const creativesKey = scopedKey("bsl_creatives", email);
  const callKey = scopedKey("bsl_last_call", email);

  const [creatives, setCreatives] = useState<Creative[]>(() => {
    const stored = getJSON<Creative[]>(creativesKey);
    return Array.isArray(stored) ? stored : [];
  });
  const [generatingKinds, setGeneratingKinds] = useState<Set<CreativeKind>>(new Set());
  const [openCreative, setOpenCreative] = useState<Creative | null>(null);

  const latestCallContext = useCallback((): CapturedFields | null => {
    const call = getJSON<LastCall>(callKey);
    const s = call?.summary;
    if (!s) return null;
    const hasAny = (["business", "offer", "audience", "goal", "voice"] as const).some((k) => (s[k] || "").trim());
    return hasAny ? s : null;
  }, [callKey]);

  const live = latestCallContext();
  // Chip display swaps the whole source (live call OR memory), matching
  // the original's refreshCreativeCtx(). Generation merges per-field
  // (live falls back to memory field-by-field), matching creativeCtx() —
  // an intentional distinction in the source, preserved here.
  const memForChips = !live ? activeClient : null;

  const handleGenerate = useCallback(
    async (kind: CreativeKind) => {
      if (!spendCredits("creative", 1)) return;
      const liveNow = latestCallContext();
      const ctx = resolveCreativeCtx(liveNow, activeClient);

      setGeneratingKinds((prev) => new Set(prev).add(kind));
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 100 : 1400));

      const kindDef = CREATIVE_KINDS[kind];
      const out = kindDef.build(ctx);
      const cr: Creative = {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        session: ctx._fromCall || ctx._fromMemory ? ctx.business : "",
        ts: Date.now(),
        source: ctx._fromCall ? "call" : ctx._fromMemory ? "memory" : "demo",
        theme: out.theme,
        details: { business: ctx.business, offer: ctx.offer, audience: ctx.audience, goal: ctx.goal, voice: ctx.voice },
        html: out.html,
      };

      setCreatives((prev) => {
        const next = [cr, ...prev];
        setJSON(creativesKey, next);
        return next;
      });
      setGeneratingKinds((prev) => {
        const next = new Set(prev);
        next.delete(kind);
        return next;
      });
      logActivity("creative", `Generated ${kindDef.label} · ${out.theme} style`);
      toast(`${kindDef.label} generated in the “${out.theme}” style${ctx._fromCall ? " from your call capture" : ""}`, true);
      setOpenCreative(cr);
    },
    [spendCredits, latestCallContext, activeClient, creativesKey, logActivity, toast]
  );

  function handleClear() {
    if (!creatives.length) {
      toast("Nothing to clear. The list is already empty");
      return;
    }
    if (!confirm(`Delete all ${creatives.length} creative${creatives.length > 1 ? "s" : ""}? This can't be undone.`)) return;
    setCreatives([]);
    setJSON(creativesKey, []);
    logActivity("creative", "Cleared all creatives");
    toast("All creatives cleared", true);
  }

  const ctxMeta = live
    ? `From your captured onboarding call${(live.business || "").trim() ? " · " + live.business!.trim() : ""}`
    : memForChips
      ? `From memory · ${memForChips.business} (remembered client)`
      : "No call captured yet. Demo details are used until you run an onboarding call.";

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Creative ads</h2>
          <p className="page-sub">Turn your onboarding details into ready-to-use creative. Landing pages, funnels and ad graphics.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Using details from onboarding</h3>
            <p className="panel-sub">{ctxMeta}</p>
          </div>
          <Link href="/app/agent" className="btn btn-secondary btn-sm">
            Update via call
          </Link>
        </div>
        <div className="ctx-chips">
          {CTX_LABELS.map(({ key, label }) => {
            const val = (live?.[key] || "").trim() || (memForChips?.[key] || "").trim();
            return (
              <span className={`chip${val ? "" : " chip-missing"}`} key={key}>
                <strong>{label}</strong>
                {val || (live || memForChips ? "not captured" : `${DEMO_CTX[key]} (demo)`)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="creative-grid">
        {KIND_ORDER.map((kind) => {
          const def = CREATIVE_KINDS[kind];
          const generating = generatingKinds.has(kind);
          return (
            <div className="panel creative-card" key={kind}>
              <span className="creative-icon" aria-hidden="true">
                <CreativeIcon kind={kind} size={22} />
              </span>
              <h3>{def.label}</h3>
              <p>{KIND_SUB[kind]}</p>
              <button type="button" className="btn btn-primary" disabled={generating} onClick={() => handleGenerate(kind)}>
                <span className="btn-label">{generating ? "Generating…" : `Generate ${def.label.toLowerCase()}`}</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Generated creatives</h3>
            <p className="panel-sub">Click any item to preview or download</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleClear}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Clear all
          </button>
        </div>
        <ul className="asset-list">
          {Array.from(generatingKinds).map((k) => (
            <li className="asset-skeleton" key={`sk-${k}`} />
          ))}
          {creatives.length === 0 && generatingKinds.size === 0 ? (
            <li className="asset-empty">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
              </svg>
              <p>No creatives yet. Generate a landing page, funnel or ad graphics above.</p>
            </li>
          ) : (
            creatives.map((cr) => {
              const def = CREATIVE_KINDS[cr.kind];
              const sub = (cr.source === "call" || cr.source === "memory") && cr.session ? `From onboarding · ${cr.session}` : "";
              return (
                <li className="asset-row" key={cr.id}>
                  <button type="button" className="asset-open" aria-haspopup="dialog" onClick={() => setOpenCreative(cr)}>
                    <span className="asset-row-icon">
                      <CreativeIcon kind={cr.kind} />
                    </span>
                    <span className="asset-row-main">
                      <strong>{def.label}</strong>
                      {sub && <span>{sub}</span>}
                    </span>
                    <time>{whenLabel(cr)}</time>
                    <span className="asset-chevron" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {openCreative && <CreativeModal creative={openCreative} onClose={() => setOpenCreative(null)} />}
    </>
  );
}

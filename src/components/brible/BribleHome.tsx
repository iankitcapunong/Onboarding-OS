"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMemory } from "@/hooks/useMemory";
import { useToast } from "@/components/app/ToastProvider";
import { useBrible } from "@/hooks/useBrible";
import { getJSON, scopedKey } from "@/lib/storage";
import { resolveCreativeCtx } from "@/lib/creativeBuilders";
import type { CapturedFields } from "@/lib/assetTemplates";
import { CreativeModal, type Creative } from "@/components/creative/CreativeModal";
import { BRIBLE_HOME_CHIPS, type BribleTemplate } from "@/lib/brible/constants";
import { ThumbCard } from "./ThumbCard";
import { CommunityGrid } from "./CommunityGrid";

type LastCall = { summary?: CapturedFields };

function whenLabel(ts: number) {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* Direct port of js/app.js's home screen (lovable.dev-style): the
   #bribleHome markup (app.html lines 544-591) + bribleShowHome(),
   bribleThumbCard()/bribleRenderGallery(), the prompt-box form/chips,
   and the "Attach"/"Visibility" tool-button stubs (lines ~5174-5299,
   5374-5382) — the community templates grid lives in CommunityGrid.tsx. */
export function BribleHome({ onShowBuilder }: { onShowBuilder: () => void }) {
  const { user } = useAuth();
  const { activeClient } = useMemory();
  const toast = useToast();
  const { activeVersion, versions, projectName, sendMessage, remixTemplate } = useBrible();

  const email = (user?.email || "").toLowerCase();
  const callKey = scopedKey("bsl_last_call", email);
  const creativesKey = scopedKey("bsl_creatives", email);

  const [homeText, setHomeText] = useState("");
  const [visibility, setVisibility] = useState<"Public" | "Private">("Public");
  const [openCreative, setOpenCreative] = useState<Creative | null>(null);

  // matches the original's bribleShowHome(), which reads the plain
  // creativeCtx() (call > memory > demo) for the home banner — distinct
  // from the Brible-project ctx (which can carry a remix override).
  const homeCtx = useMemo(() => {
    const call = getJSON<LastCall>(callKey);
    const live = call?.summary && (["business", "offer", "audience", "goal", "voice"] as const).some((k) => (call.summary![k] || "").trim()) ? call.summary : null;
    return resolveCreativeCtx(live, activeClient);
  }, [callKey, activeClient]);

  const websiteCreatives = useMemo(() => {
    const stored = getJSON<Creative[]>(creativesKey) || [];
    return stored.filter((cr) => cr.kind === "website" && cr.html).slice(0, 5);
  }, [creativesKey]);

  const handleBuild = useCallback(
    (text: string) => {
      onShowBuilder();
      void sendMessage(text);
    },
    [onShowBuilder, sendMessage]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = homeText.trim() || "Build my website";
    setHomeText("");
    handleBuild(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = homeText.trim() || "Build my website";
      setHomeText("");
      handleBuild(text);
    }
  }

  function handleRemix(tpl: BribleTemplate) {
    if (versions.length && !confirm(`Remix "${tpl.name}"? This replaces your current Brible project.`)) return;
    remixTemplate(tpl.ctx, tpl.spec, tpl.name);
    onShowBuilder();
  }

  const gallerySlots: React.ReactNode[] = [];
  if (activeVersion) {
    gallerySlots.push(
      <ThumbCard
        key="current"
        title={projectName || "Untitled site"}
        meta={`Current project · v${versions.length} · ${activeVersion.themeKey}`}
        html={activeVersion.html}
        onClick={onShowBuilder}
      />
    );
  }
  websiteCreatives.forEach((cr) => {
    gallerySlots.push(
      <ThumbCard
        key={cr.id}
        title={cr.session ? `${cr.session} · website` : "Website"}
        meta={`${cr.theme ? `${cr.theme} · ` : ""}${whenLabel(cr.ts)}`}
        html={cr.html}
        onClick={() => setOpenCreative(cr)}
      />
    );
  });

  return (
    <div className="brible-home" id="bribleHome">
      <div className="bh-glow" aria-hidden="true" />

      <div className="bh-hero">
        <div className="bh-logo" aria-hidden="true">
          <span className="brible-mark">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </span>
          Brible
        </div>
        <h1>
          Build something <span className="bh-love">Brible</span>
        </h1>
        <p className="bh-sub">Create client websites by chatting with AI. Pre-briefed by your onboarding calls.</p>

        <form className="bh-promptbox" onSubmit={handleSubmit}>
          <textarea
            rows={3}
            placeholder="Ask Brible to create a website for your client…"
            value={homeText}
            onChange={(e) => setHomeText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="bh-foot">
            <div className="bh-foot-left">
              <button
                type="button"
                className="bh-tool"
                title="Attach files"
                aria-label="Attach files"
                onClick={() => toast("Attachments are coming soon. Describe what you want instead")}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </button>
              <button
                type="button"
                className="bh-tool bh-vis"
                title="Site visibility"
                onClick={() => {
                  const next = visibility === "Public" ? "Private" : "Public";
                  setVisibility(next);
                  toast(`Site visibility: ${next}`, true);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                  <path d="M2 12h20" />
                </svg>
                <span>{visibility}</span>
              </button>
              <span className="bh-ctx">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>{homeCtx._fromCall ? `Briefed: ${homeCtx.business} · ${homeCtx.offer}` : "Demo brief. Run an onboarding call to personalize"}</span>
              </span>
            </div>
            <button type="submit" className="bh-send" aria-label="Build">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          </div>
        </form>

        <div className="bh-chips">
          {BRIBLE_HOME_CHIPS.map((c) => (
            <button key={c} type="button" className="bchip" onClick={() => handleBuild(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="bh-gallery" id="bribleMySites">
        <h2 style={{ display: gallerySlots.length ? "" : "none" }}>My sites</h2>
        <div className="bh-grid">{gallerySlots}</div>
      </div>

      <CommunityGrid onRemix={handleRemix} />

      {openCreative && <CreativeModal creative={openCreative} onClose={() => setOpenCreative(null)} />}
    </div>
  );
}

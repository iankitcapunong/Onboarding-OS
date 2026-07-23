"use client";

import { useMemo, useState } from "react";
import { buildWebsiteHTML } from "@/lib/creativeBuilders";
import { specToWebsiteOpts } from "@/lib/bribleEngine";
import { BRIBLE_TAB_LIST, BRIBLE_TPLS, type BribleTemplate } from "@/lib/brible/constants";
import { ThumbCard } from "./ThumbCard";

/* Direct port of js/app.js's bribleRenderCommunity() (lines ~5346-5372):
   tab-filtered grid of the 16 hardcoded remixable templates. Each
   template's HTML is rendered once via buildWebsiteHTML and memoized —
   the original's bribleTplCache object, here a useMemo computed once
   since BRIBLE_TPLS/buildWebsiteHTML are both pure/stable. */
export function CommunityGrid({ onRemix }: { onRemix: (tpl: BribleTemplate) => void }) {
  const [activeTab, setActiveTab] = useState("Popular");

  const htmlByName = useMemo(() => {
    const cache: Record<string, string> = {};
    BRIBLE_TPLS.forEach((tpl) => {
      cache[tpl.name] = buildWebsiteHTML(tpl.ctx, specToWebsiteOpts(tpl.spec)).html;
    });
    return cache;
  }, []);

  const filtered = BRIBLE_TPLS.filter((t) => activeTab === "Popular" || t.cat === activeTab);

  return (
    <div className="bh-gallery" id="bribleCommunity">
      <h2>From the Community</h2>
      <div className="bh-tabs" id="bribleTabs">
        {BRIBLE_TAB_LIST.map((tb) => (
          <button key={tb} type="button" className={`bh-tab${tb === activeTab ? " active" : ""}`} onClick={() => setActiveTab(tb)}>
            {tb}
          </button>
        ))}
      </div>
      <div className="bh-grid" id="bribleCommunityGrid">
        {filtered.map((tpl) => (
          <ThumbCard
            key={tpl.name}
            title={tpl.name}
            meta={`${tpl.cat} · ${tpl.remixes.toLocaleString()} remixes`}
            html={htmlByName[tpl.name]}
            onClick={() => onRemix(tpl)}
            badge={
              <span className="bh-remix">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 2.1l4 4-4 4" />
                  <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8" />
                  <path d="M7 21.9l-4-4 4-4" />
                  <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
                </svg>
                Remix
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useAssets, type Asset } from "@/hooks/useAssets";
import { useToast } from "@/components/app/ToastProvider";
import { AssetModal } from "@/components/app/AssetModal";
import { CreativeModal, type Creative } from "@/components/creative/CreativeModal";
import type { AssetType } from "@/lib/assetTemplates";

const ASSET_ICON: Record<string, React.ReactNode> = {
  Website: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
  ),
  "Email copy": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
  ),
  "Ad copy": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
  ),
  "Landing page copy": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
  ),
};

const OPTIONS: { value: AssetType; label: string; sub: string; defaultChecked: boolean }[] = [
  { value: "Email copy", label: "Email copy", sub: "Welcome + nurture sequence", defaultChecked: true },
  { value: "Ad copy", label: "Ad copy", sub: "Hooks + variations per platform", defaultChecked: true },
  { value: "Landing page copy", label: "Landing page copy", sub: "Hero, sections & CTA", defaultChecked: false },
  { value: "Website", label: "Website", sub: "Full site. Hero, services, reviews & contact", defaultChecked: false },
];

function assetToCreative(a: Asset): Creative {
  return {
    id: a.id,
    kind: "website",
    session: a.session,
    ts: a.ts || Date.now(),
    source: a.source === "seed" ? "demo" : a.source,
    theme: a.theme || "",
    details: {
      business: a.details?.business || "",
      offer: a.details?.offer || "",
      audience: a.details?.audience || "",
      goal: a.details?.goal || "",
      voice: a.details?.voice || "",
    },
    html: a.html || "",
  };
}

function whenLabel(a: Asset) {
  if (!a.ts) return a.when || "";
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(a.ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(a.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AssetsPage() {
  const { assets, latestSessionName, generate, clearAll, generating } = useAssets();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<AssetType>>(
    () => new Set(OPTIONS.filter((o) => o.defaultChecked).map((o) => o.value))
  );
  const [openAsset, setOpenAsset] = useState<Asset | null>(null);

  function toggle(value: AssetType, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  function handleClear() {
    if (!assets.length) {
      toast("Nothing to clear. The list is already empty");
      return;
    }
    if (!confirm(`Delete all ${assets.length} generated asset${assets.length > 1 ? "s" : ""}? This can't be undone.`)) return;
    clearAll();
    toast("All assets cleared", true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Asset generation</h2>
          <p className="page-sub">Pick what to generate from each onboarding. Everything is stored here.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Generate from latest session</h3>
            <p className="panel-sub">
              {latestSessionName ? (
                <>
                  Session: <strong>{latestSessionName}</strong> · captured from your onboarding call
                </>
              ) : (
                "No call captured yet. Run an onboarding call to brief your assets."
              )}
            </p>
          </div>
        </div>
        <div className="asset-options">
          {OPTIONS.map((o) => (
            <label className="asset-opt" key={o.value}>
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={(e) => toggle(o.value, e.currentTarget.checked)}
              />
              <span className="asset-opt-body">
                {ASSET_ICON[o.value]}
                <strong>{o.label}</strong>
                <span>{o.sub}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="pg-actions" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={generating}
            onClick={() => generate(Array.from(selected))}
          >
            <span className="btn-label">{generating ? "Generating…" : "Generate selected"}</span>
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Generated assets</h3>
            <p className="panel-sub">All assets, stored in one place</p>
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
          {assets.length === 0 ? (
            <li className="asset-empty">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>
                No assets yet. Pick what to generate above and click <strong>Generate selected</strong>.
              </p>
            </li>
          ) : (
            assets.map((a) => {
              const sub = (a.source === "call" || a.source === "memory") && a.session ? `From onboarding · ${a.session}` : "";
              return (
                <li className="asset-row" key={a.id}>
                  <button type="button" className="asset-open" aria-haspopup="dialog" onClick={() => setOpenAsset(a)}>
                    <span className="asset-row-icon">{ASSET_ICON[a.type] || ASSET_ICON["Email copy"]}</span>
                    <span className="asset-row-main">
                      <strong>{a.type}</strong>
                      {sub && <span>{sub}</span>}
                    </span>
                    <time>{whenLabel(a)}</time>
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

      {openAsset &&
        (openAsset.html ? (
          <CreativeModal creative={assetToCreative(openAsset)} onClose={() => setOpenAsset(null)} />
        ) : (
          <AssetModal asset={openAsset} onClose={() => setOpenAsset(null)} />
        ))}
    </>
  );
}

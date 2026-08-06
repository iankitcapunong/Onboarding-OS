"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/components/app/ToastProvider";
import { hasSpintax, spinText } from "@/lib/assetTemplates";
import type { Asset } from "@/hooks/useAssets";

const ASSET_ICON: Record<string, React.ReactNode> = {
  Website: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
  ),
  "Email copy": (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
  ),
  "Ad copy": (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
  ),
  "SMS copy": (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
  ),
  "Landing page copy": (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
  ),
};

const DETAIL_LABELS: Record<string, string> = {
  business: "Business",
  offer: "Offer",
  audience: "Audience",
  goal: "Goal",
  voice: "Brand voice",
};

function SpintaxText({ text }: { text: string }) {
  if (!hasSpintax(text)) return <>{text}</>;
  const re = /\{([^{}]*\|[^{}]*)\}/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    const opts = m[1].split("|");
    parts.push(
      <span className="spintax-token" title="Spintax: one of these is used per send" key={key++}>
        {opts.map((opt, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="spintax-sep">|</span>}
            {opt}
          </Fragment>
        ))}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

function DocBody({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <h4 className="doc-h2" key={i}><SpintaxText text={line.slice(3)} /></h4>;
        if (line.startsWith("# ")) return <h3 className="doc-h1" key={i}><SpintaxText text={line.slice(2)} /></h3>;
        if (line.startsWith("- ")) return <p className="doc-li" key={i}><SpintaxText text={line.slice(2)} /></p>;
        if (!line.trim()) return <div className="doc-gap" key={i} />;
        return <p className="doc-p" key={i}><SpintaxText text={line} /></p>;
      })}
    </>
  );
}

function exportText(a: Asset, spun: string | null) {
  let text = spun || a.content || "";
  if (a.details) {
    const lines = Object.keys(DETAIL_LABELS)
      .filter((k) => (a.details![k as keyof typeof a.details] || "").trim())
      .map((k) => `${DETAIL_LABELS[k]}: ${a.details![k as keyof typeof a.details]}`);
    if (lines.length) text = `CAPTURED ONBOARDING DETAILS\n${lines.join("\n")}\n\n${text}`;
  }
  return text;
}

function whenLabel(a: Asset) {
  if (!a.ts) return a.when || "";
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(a.ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(a.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AssetModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { logActivity } = useActivityLog();
  const toast = useToast();
  const [spunContent, setSpunContent] = useState<string | null>(null);
  const [spinCount, setSpinCount] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [onClose]);

  const metaParts = [
    (asset.source === "call" || asset.source === "memory") && asset.session ? `From onboarding · ${asset.session}` : null,
    whenLabel(asset),
    asset.source === "call" ? "generated from your call capture" : null,
    asset.source === "memory" ? "briefed from client memory" : null,
  ].filter(Boolean);

  const spintaxEnabled = hasSpintax(asset.content || "");

  function handleSpin() {
    const next = spinText(asset.content || "");
    setSpunContent(next);
    setSpinCount((c) => c + 1);
    if (spinCount === 0) logActivity("asset", `Spun a ${asset.type} variant`);
  }

  async function handleCopy() {
    const text = exportText(asset, spunContent);
    const copiedSpun = !!spunContent;
    try {
      await navigator.clipboard.writeText(text);
      logActivity("asset", `Copied ${asset.type}${copiedSpun ? " (spun variant)" : ""} to clipboard`);
      toast(copiedSpun ? "Spun variant copied to clipboard" : "Copied to clipboard", true);
    } catch {
      toast("Couldn't copy. Select the text manually");
    }
  }

  function handleDownload() {
    const name = `${asset.type} - ${asset.session}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const blob = new Blob([exportText(asset, spunContent)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    logActivity("asset", `Downloaded ${asset.type}`);
    toast("Download started", true);
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="assetModalTitle">
        <div className="modal-head">
          <div className="modal-id">
            <span className="asset-row-icon" aria-hidden="true">{ASSET_ICON[asset.type] || ASSET_ICON["Email copy"]}</span>
            <div>
              <h3 id="assetModalTitle">{asset.type}</h3>
              <p className="panel-sub">{metaParts.join(" · ")}</p>
            </div>
          </div>
          <button type="button" className="modal-close" aria-label="Close" ref={closeRef} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        {spintaxEnabled && (
          <div className="modal-spinbar">
            <span className="spin-note">
              {spunContent ? `Variant ${spinCount} · every spin rewords subject lines, greetings and CTAs` : "Spintax enabled · highlighted groups alternate copy per send"}
            </span>
            <span className="spin-actions">
              {spunContent && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSpunContent(null); setSpinCount(0); }}>
                  Show spintax
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleSpin}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <polyline points="21 3 21 9 15 9" />
                </svg>
                Spin variant
              </button>
            </span>
          </div>
        )}
        <div className="modal-body" tabIndex={0}>
          {asset.details && Object.keys(DETAIL_LABELS).some((k) => (asset.details![k as keyof typeof asset.details] || "").trim()) && (
            <div className="doc-details">
              <h4>Captured onboarding details</h4>
              <dl>
                {Object.keys(DETAIL_LABELS)
                  .filter((k) => (asset.details![k as keyof typeof asset.details] || "").trim())
                  .map((k) => (
                    <Fragment key={k}>
                      <dt>{DETAIL_LABELS[k]}</dt>
                      <dd>{asset.details![k as keyof typeof asset.details]}</dd>
                    </Fragment>
                  ))}
              </dl>
            </div>
          )}
          <DocBody text={spunContent || asset.content || "No content stored for this asset."} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopy}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            Copy text
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleDownload}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/components/app/ToastProvider";
import { CREATIVE_KINDS, type CreativeFields, type CreativeKind } from "@/lib/creativeBuilders";
import { CreativeIcon } from "./CreativeIcon";

export type Creative = {
  id: string;
  kind: CreativeKind;
  session: string;
  ts: number;
  source: "call" | "memory" | "demo";
  theme: string;
  details: CreativeFields;
  html: string;
};

function whenLabel(cr: Creative) {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(cr.ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(cr.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function creativeFileName(cr: Creative) {
  const label = CREATIVE_KINDS[cr.kind].label;
  return (label + " - " + cr.session).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + ".html";
}

/* Direct port of js/app.js's creative preview modal (openCreative() /
   closeCreative(), lines ~3796-3856): renders the stored full HTML
   document in a sandboxed iframe via srcDoc (React-idiomatic replacement
   for the original's `cFrame.srcdoc = cr.html`), with the same two
   actions the original exposes — "Open in new tab" and "Download .html".
   There is no copy-HTML button and no responsive-width toggle in the
   source; none is added here. */
export function CreativeModal({ creative, onClose }: { creative: Creative; onClose: () => void }) {
  const { logActivity } = useActivityLog();
  const toast = useToast();
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

  const kind = CREATIVE_KINDS[creative.kind] || CREATIVE_KINDS.landing;

  const metaParts = [
    creative.source === "call" && creative.session ? `From onboarding · ${creative.session}` : null,
    whenLabel(creative),
    creative.theme ? `“${creative.theme}” style` : null,
    creative.source === "call" ? "built from your call capture" : null,
  ].filter(Boolean);

  function handleOpenNewTab() {
    const blob = new Blob([creative.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function handleDownload() {
    const blob = new Blob([creative.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = creativeFileName(creative);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    logActivity("creative", `Downloaded ${kind.label}`);
    toast("Download started", true);
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="creativeModalTitle">
        <div className="modal-head">
          <div className="modal-id">
            <span className="asset-row-icon" aria-hidden="true">
              <CreativeIcon kind={creative.kind} />
            </span>
            <div>
              <h3 id="creativeModalTitle">{kind.label}</h3>
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
        <div className="modal-body creative-body">
          <iframe title="Creative preview" className="creative-frame" srcDoc={creative.html} sandbox="allow-same-origin" />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleOpenNewTab}>
            Open in new tab
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleDownload}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            Download .html
          </button>
        </div>
      </div>
    </div>
  );
}

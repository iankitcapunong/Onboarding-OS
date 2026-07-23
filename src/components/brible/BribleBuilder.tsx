"use client";

import { useState } from "react";
import { useBrible } from "@/hooks/useBrible";
import { useToast } from "@/components/app/ToastProvider";
import { bribleVPages } from "@/lib/bribleEngine";
import { ChatPanel } from "./ChatPanel";
import { PreviewStage } from "./PreviewStage";

const VIEWPORTS: { vw: string; title: string; icon: React.ReactNode }[] = [
  {
    vw: "100%",
    title: "Desktop",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <line x1="8" x2="16" y1="21" y2="21" />
        <line x1="12" x2="12" y1="17" y2="21" />
      </svg>
    ),
  },
  {
    vw: "768px",
    title: "Tablet",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="16" height="20" x="4" y="2" rx="2" />
        <line x1="12" x2="12.01" y1="18" y2="18" />
      </svg>
    ),
  },
  {
    vw: "390px",
    title: "Phone",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="14" height="20" x="5" y="2" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
  },
];

function slugifyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/* Direct port of app.html's #bribleBuilder header + body (lines
   ~593-687) and js/app.js's mode-toggle IIFE, Refresh/New/Save/
   Download/Open/Publish handlers, and the project-name rename prompt
   (lines ~4520-4562, ~4996-5172). */
export function BribleBuilder({ onShowHome }: { onShowHome: () => void }) {
  const { activeVersion, versions, projectName, publishing, newSite, renameProject, publish, saveToLibraries, clearSelection } = useBrible();
  const toast = useToast();

  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [editOn, setEditOnState] = useState(false);
  const [designOn, setDesignOn] = useState(false);
  const [viewportWidth, setViewportWidth] = useState("100%");
  const [frameKey, setFrameKey] = useState(0);

  function setEditOn(next: boolean) {
    setEditOnState(next);
    if (!next) clearSelection();
    if (next) toast("Edit mode. Click any element in the preview", true);
  }

  function clickPreview() {
    setMode("preview");
    setDesignOn(false);
  }
  function clickCode() {
    setMode("code");
    setDesignOn(false);
    setEditOn(false);
  }
  function clickEdit() {
    if (!activeVersion) {
      toast("Build a site first, then click elements to edit them");
      return;
    }
    setMode("preview");
    setDesignOn(false);
    setEditOn(!editOn);
  }
  function clickDesign() {
    if (!activeVersion) {
      toast("Build a site first, then open Design");
      return;
    }
    setMode("preview");
    setEditOn(false);
    setDesignOn(!designOn);
  }

  function handleRefresh() {
    setFrameKey((n) => n + 1);
    toast("Preview refreshed", true);
  }

  function handleNew() {
    if (versions.length && !confirm("Start a new site? Current versions will be cleared.")) return;
    newSite();
    onShowHome();
  }

  function handleRename() {
    const current = projectName || "Untitled site";
    const name = prompt("Project name", current);
    if (name && name.trim()) renameProject(name);
  }

  function handleDownload() {
    if (!activeVersion) {
      toast("Nothing to download yet. Build a site first");
      return;
    }
    const pages = bribleVPages(activeVersion);
    const slugs = Object.keys(pages);
    if (!slugs.length) {
      toast("Nothing to download yet. Build a site first");
      return;
    }
    const base = slugifyName(projectName || "brible-site");
    slugs.forEach((slug, i) => {
      setTimeout(() => {
        const blob = new Blob([pages[slug]], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${slug === "home" ? base : `${base}-${slug}`}.html`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, i * 350);
    });
    toast(slugs.length > 1 ? `Downloading ${slugs.length} pages…` : "Download started", true);
  }

  function handleOpen() {
    if (!activeVersion) {
      toast("Nothing to open yet. Build a site first");
      return;
    }
    const blob = new Blob([activeVersion.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function handlePublish() {
    if (!activeVersion) {
      toast("Build a site first. Then publish it");
      return;
    }
    await publish();
  }

  return (
    <div className="brible-builder" id="bribleBuilder">
      <header className="brible-top">
        <div className="brible-id">
          <button type="button" className="brible-mark brible-homebtn" title="Brible home" aria-label="Brible home" onClick={onShowHome}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>
          <div>
            <strong onClick={handleRename} style={{ cursor: "pointer" }}>
              {projectName || "Untitled site"}
            </strong>
            <span className="brible-sub">Brible engine · AI-ready</span>
          </div>
        </div>

        <div className="brible-vports" role="group" aria-label="Preview size">
          {VIEWPORTS.map((v) => (
            <button
              key={v.vw}
              type="button"
              className={`vport-btn${viewportWidth === v.vw ? " active" : ""}`}
              title={v.title}
              onClick={() => setViewportWidth(v.vw)}
            >
              {v.icon}
            </button>
          ))}
        </div>

        <div className="brible-actions">
          <div className="brible-mode" role="group" aria-label="View mode">
            <button type="button" className={`mode-btn${mode === "preview" ? " active" : ""}`} onClick={clickPreview}>
              Preview
            </button>
            <button type="button" className={`mode-btn${mode === "code" ? " active" : ""}`} onClick={clickCode}>
              Code
            </button>
            <button
              type="button"
              className={`mode-btn mode-edit${editOn ? " active" : ""}`}
              title="Click any element in the preview to edit it"
              onClick={clickEdit}
            >
              Edit
            </button>
            <button
              type="button"
              className={`mode-btn${designOn ? " active" : ""}`}
              title="Reorder sections, edit colors and typography"
              onClick={clickDesign}
            >
              Design
            </button>
          </div>
          <button type="button" className="bt-btn" title="Refresh preview" aria-label="Refresh preview" onClick={handleRefresh}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
          <button type="button" className="bt-btn" title="Start a new site" onClick={handleNew}>
            New
          </button>
          <button type="button" className="bt-btn" title="Save to Creative ads" onClick={() => saveToLibraries(false)}>
            Save
          </button>
          <button type="button" className="bt-btn" title="Download HTML" onClick={handleDownload}>
            Download
          </button>
          <button type="button" className="bt-btn" title="Open full size" onClick={handleOpen}>
            Open
          </button>
          <button type="button" className="bt-primary" disabled={publishing} onClick={handlePublish}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            </svg>
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      <div className="brible-body">
        <ChatPanel />
        <PreviewStage mode={mode} editOn={editOn} designOn={designOn} viewportWidth={viewportWidth} frameKey={frameKey} />
      </div>
    </div>
  );
}

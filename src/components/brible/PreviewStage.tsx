"use client";

import { useEffect } from "react";
import { useBrible } from "@/hooks/useBrible";
import { bribleVActiveSlug, bribleVPages } from "@/lib/bribleEngine";
import { BRIBLE_EDIT_JS } from "@/lib/brible/constants";
import { DesignPanel } from "./DesignPanel";
import { VersionsBar } from "./VersionsBar";

/* Direct port of the stage half of app.html's #route-brible builder
   (lines ~653-686) + js/app.js's briblePreview()/bribleRenderFrame()/
   bribleRenderPageTabs() (lines ~3973-4052) and the postMessage
   listener that turns an Edit-mode click into a selection (lines
   ~4068-4079). The frame-wrap iframe is kept permanently mounted
   (visibility toggled, not unmounted) across Preview/Code/Edit so
   switching modes never reloads it — matching the original's
   `style.visibility` toggle rather than a DOM swap. */
export function PreviewStage({
  mode,
  editOn,
  designOn,
  viewportWidth,
  frameKey,
}: {
  mode: "preview" | "code";
  editOn: boolean;
  designOn: boolean;
  viewportWidth: string;
  frameKey: number;
}) {
  const { activeVersion, pageTabs, selection, setSelection, clearSelection, setActivePage } = useBrible();

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.brible !== "select" || !editOn) return;
      if (!d.text) return;
      setSelection({ tag: d.tag, cls: String(d.cls), text: d.text });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editOn, setSelection]);

  const activeSlug = activeVersion ? bribleVActiveSlug(activeVersion) : undefined;
  const pages = activeVersion ? bribleVPages(activeVersion) : {};
  const html = (activeSlug && pages[activeSlug]) || activeVersion?.html || "";
  const srcDoc = activeVersion ? (editOn ? html.replace("</body>", `${BRIBLE_EDIT_JS}</body>`) : html) : "";

  return (
    <main className="brible-stage">
      <div className="brible-selbar" hidden={!selection}>
        <span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          </svg>
          Selected: <strong>{selection ? `“${selection.text.slice(0, 60)}${selection.text.length > 60 ? "…" : ""}”` : ""}</strong>. Type the new text in the chat box
        </span>
        <button type="button" onClick={clearSelection} aria-label="Clear selection">
          ✕
        </button>
      </div>

      <div className="brible-pagetabs" hidden={pageTabs.length < 2}>
        {pageTabs.map((tab) => (
          <button
            key={tab.slug}
            type="button"
            className={`bpage-tab${tab.slug === activeSlug ? " active" : ""}`}
            onClick={() => setActivePage(tab.slug)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="brible-stage-row">
        <div className="brible-frame-wrap">
          <iframe
            key={frameKey}
            className="brible-frame"
            sandbox="allow-scripts"
            title="Brible site preview"
            srcDoc={srcDoc}
            style={{ visibility: mode === "code" ? "hidden" : "visible", width: viewportWidth }}
          />
          <pre className="brible-code" hidden={mode !== "code"}>
            <code>{html}</code>
          </pre>
          {!activeVersion && (
            <div className="brible-empty">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <p>
                Your website preview appears here.
                <br />
                Tell Brible what to build in the chat.
              </p>
            </div>
          )}
        </div>
        {designOn && <DesignPanel />}
      </div>

      <VersionsBar />
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { VideoItem } from "./api";
import { formatElapsed, ratioCss } from "./utils";

type Props = {
  item: VideoItem;
  onView: (item: VideoItem) => void;
  onDownload: (item: VideoItem) => void;
  onCopy: (item: VideoItem) => void;
  onRemove: (id: string) => void;
};

export function GalleryCard({ item, onView, onDownload, onCopy, onRemove }: Props) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(Date.now() - item.ts));

  // Ticks the "Generating video · Xs" label while the task is in flight.
  // The original updated this text only on each 8s poll tick; a local 1s
  // interval is the idiomatic React equivalent (same end state, smoother).
  useEffect(() => {
    if (item.state !== "generating") return;
    const id = setInterval(() => setElapsed(formatElapsed(Date.now() - item.ts)), 1000);
    return () => clearInterval(id);
  }, [item.state, item.ts]);

  const meta = (
    <div className="ig-card-meta">
      <strong>{item.modelName}</strong>
      <span className="ig-card-prompt" title={item.prompt}>{item.prompt}</span>
      <span className="ig-card-sub">
        {item.ratio || "auto"}
        {item.res ? ` · ${item.res}` : ""}
        {item.dur ? ` · ${item.dur}s` : ""}
        {item.credits ? ` · ${item.credits} credits` : ""}
      </span>
    </div>
  );

  if (item.state === "generating") {
    return (
      <div className="ig-card ig-generating" data-id={item.id}>
        <div className="ig-frame ig-shimmer" style={{ aspectRatio: ratioCss(item.ratio) }}>
          <span className="ig-spin" aria-hidden="true" />
          <span className="ig-genlabel">
            Generating video · <span className="ig-elapsed">{elapsed}</span>
          </span>
        </div>
        {meta}
      </div>
    );
  }

  if (item.state === "fail") {
    return (
      <div className="ig-card ig-fail" data-id={item.id}>
        <div className="ig-frame ig-failbox" style={{ aspectRatio: ratioCss(item.ratio) }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <p>{item.err || "Generation failed"}</p>
        </div>
        {meta}
        <div className="ig-card-actions">
          <button type="button" className="ig-act ig-act-danger" onClick={() => onRemove(item.id)}>Remove</button>
        </div>
      </div>
    );
  }

  const url = item.urls[0] || "";
  return (
    <div className="ig-card ig-success" data-id={item.id}>
      <div className="ig-frame" style={{ aspectRatio: ratioCss(item.ratio) }}>
        <video src={url} controls preload="metadata" playsInline />
      </div>
      {meta}
      <div className="ig-card-actions">
        <button type="button" className="ig-act" onClick={() => onView(item)}>View</button>
        <button type="button" className="ig-act" onClick={() => onDownload(item)}>Download</button>
        <button type="button" className="ig-act" onClick={() => onCopy(item)}>Copy URL</button>
        <button type="button" className="ig-act ig-act-danger" onClick={() => onRemove(item.id)}>Remove</button>
      </div>
    </div>
  );
}

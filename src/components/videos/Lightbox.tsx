"use client";

import { useEffect, useRef } from "react";
import type { VideoItem } from "./api";

type Props = {
  item: VideoItem;
  onClose: () => void;
  onDownload: (item: VideoItem) => void;
};

export function Lightbox({ item, onClose, onDownload }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function handleClose() {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    onClose();
  }

  return (
    <div
      className="ig-lightbox"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) handleClose();
      }}
    >
      <button type="button" className="ig-lb-close" aria-label="Close" onClick={handleClose}>✕</button>
      <video ref={videoRef} src={item.urls[0]} controls autoPlay playsInline />
      <div className="ig-lb-bar">
        <span className="ig-lb-meta">{item.modelName} · {item.prompt.slice(0, 90)}</span>
        <button type="button" className="btn btn-primary btn-sm ig-lb-dl" onClick={() => onDownload(item)}>Download</button>
      </div>
    </div>
  );
}

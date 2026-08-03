"use client";

import { useEffect, useRef } from "react";

/* Power AI hero video background (docs/power-ai-design.md).
   The fade is JS-driven per spec — a requestAnimationFrame loop maps
   currentTime against duration (0.5s in / 0.5s out) with no CSS
   transition, and instead of the `loop` attribute the video restarts
   manually after a 100ms black hold so the crossfade stays smooth. */

const FADE = 0.5;
const RESTART_DELAY_MS = 100;
const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4";

export function PowerVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const video = el; // non-null binding the closures below can rely on

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reduceMq.matches;
    let rafId: number | null = null;
    let restartTimer: number | null = null;

    function tick() {
      rafId = requestAnimationFrame(tick);
      const duration = video.duration;
      if (!duration || Number.isNaN(duration)) return;
      const t = video.currentTime;
      let opacity = 1;
      if (t < FADE) {
        opacity = t / FADE;
      } else if (duration - t < FADE) {
        opacity = Math.max((duration - t) / FADE, 0);
      }
      video.style.opacity = opacity.toFixed(3);
    }

    function onEnded() {
      video.style.opacity = "0";
      restartTimer = window.setTimeout(() => {
        video.currentTime = 0;
        video.play().catch(() => {});
      }, RESTART_DELAY_MS);
    }

    function start() {
      // Autoplay can be blocked — the near-black canvas simply stays
      video.play().catch(() => {});
      if (!rafId) tick();
    }

    function stop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      video.pause();
    }

    video.addEventListener("ended", onEnded);

    if (!reduced) start();

    function onReduceChange() {
      reduced = reduceMq.matches;
      if (reduced) {
        stop();
        video.style.opacity = "0";
      } else {
        start();
      }
    }
    reduceMq.addEventListener("change", onReduceChange);

    function onVisibilityChange() {
      if (reduced) return;
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      if (restartTimer) window.clearTimeout(restartTimer);
      video.removeEventListener("ended", onEnded);
      reduceMq.removeEventListener("change", onReduceChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className="power-video" aria-hidden="true">
      <video ref={videoRef} src={VIDEO_SRC} muted playsInline preload="auto" />
    </div>
  );
}

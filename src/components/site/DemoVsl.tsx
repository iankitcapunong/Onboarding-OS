"use client";

import { useEffect, useRef, useState } from "react";

import { callLeadCapture } from "@/lib/edgeFunctions";

const LEAD_KEY = "bsl_lead";

/* Ported from js/landing.js's VSL player + lead-capture modal, which are
   coupled: playing the video starts an 8s timer (once per visitor) that
   opens the lead modal. */
export function DemoVsl() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const popupTimer = useRef<number | null>(null);
  const lastFocused = useRef<Element | null>(null);

  function validEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  function openLeadModal() {
    lastFocused.current = document.activeElement;
    setSubmitted(false);
    setModalOpen(true);
    document.body.style.overflow = "hidden";
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function closeLeadModal() {
    setModalOpen(false);
    document.body.style.overflow = "";
    if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
  }

  function armPopupTimer() {
    if (popupTimer.current !== null) return;
    if (localStorage.getItem(LEAD_KEY)) return;
    popupTimer.current = window.setTimeout(openLeadModal, 8000);
  }

  function startVideo() {
    if (isPlaying) return;
    // play() can be rejected (iOS low-power mode, data saver, decode
    // failure). isPlaying flips in onPlay — only once playback actually
    // starts — so a rejection leaves the poster up instead of a black,
    // frozen-looking player. The fallback hands over native controls.
    videoRef.current?.play().catch(() => setPlayFailed(true));
  }

  function stopVideo() {
    setIsPlaying(false);
    if (popupTimer.current) {
      window.clearTimeout(popupTimer.current);
      popupTimer.current = null;
    }
    videoRef.current?.pause();
  }

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && modalOpen) closeLeadModal();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [modalOpen]);

  useEffect(() => {
    return () => {
      if (popupTimer.current) window.clearTimeout(popupTimer.current);
      document.body.style.overflow = "";
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const nameOk = name.length > 0;
    const emailOk = validEmail(email);
    setNameError(!nameOk);
    setEmailError(!emailOk);
    if (!nameOk) {
      (form.elements.namedItem("name") as HTMLInputElement).focus();
      return;
    }
    if (!emailOk) {
      (form.elements.namedItem("email") as HTMLInputElement).focus();
      return;
    }

    setSubmitting(true);
    try {
      await callLeadCapture({ name, email, source: "video" });
    } catch {
      // A failed network call must not strand the visitor on a spinner —
      // the localStorage copy below still records the lead client-side.
    }
    localStorage.setItem(
      LEAD_KEY,
      JSON.stringify({ name, email, source: "video", at: new Date().toISOString() })
    );
    setSubmitting(false);
    setSubmitted(true);
  }

  return (
    <>
      <div className="vsl-wrap">
        <div
          className="vsl-player"
          role="button"
          tabIndex={0}
          aria-label={isPlaying ? "Demo video playing" : "Play the demo walkthrough"}
          onClick={() => {
            if (!isPlaying) startVideo();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !isPlaying) {
              e.preventDefault();
              startVideo();
            }
          }}
        >
          <video
            className="vsl-video"
            ref={videoRef}
            src="/media/vsl-demo.mp4"
            poster="/media/vsl-poster.jpg"
            playsInline
            preload="metadata"
            controls={isPlaying || playFailed}
            onPlay={() => {
              setIsPlaying(true);
              armPopupTimer();
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress((v.currentTime / v.duration) * 100);
            }}
            onEnded={stopVideo}
          />
          {!isPlaying && !playFailed && (
            <div className="vsl-poster">
              <div className="vsl-play" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.52.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z" />
                </svg>
              </div>
            </div>
          )}
          <div className="vsl-progress">
            <div className="vsl-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div
        className={`modal-overlay${modalOpen ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leadTitle"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeLeadModal();
        }}
      >
        <div className="modal">
          <button
            type="button"
            className="modal-close"
            aria-label="Close dialog"
            onClick={closeLeadModal}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          {!submitted ? (
            <div>
              <span className="badge badge-soft">Want more</span>
              <h3 id="leadTitle">Want a walkthrough built around your business?</h3>
              <p className="modal-sub">
                Drop your name and email and we&apos;ll follow up with a breakdown for your specific use case.
              </p>
              <form noValidate onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="leadName">
                    Name <span className="req" aria-hidden="true">*</span>
                  </label>
                  <input
                    className="input"
                    type="text"
                    id="leadName"
                    name="name"
                    ref={nameRef}
                    autoComplete="name"
                    placeholder="Jane Smith"
                    required
                    aria-invalid={nameError}
                    onBlur={(e) => {
                      if (e.currentTarget.value !== "") setNameError(e.currentTarget.value.trim().length === 0);
                    }}
                  />
                  <p className={`field-error${nameError ? " visible" : ""}`} role="alert">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4" />
                      <path d="M12 16h.01" />
                    </svg>
                    Please enter your name.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="leadEmail">
                    Email <span className="req" aria-hidden="true">*</span>
                  </label>
                  <input
                    className="input"
                    type="email"
                    id="leadEmail"
                    name="email"
                    autoComplete="email"
                    placeholder="jane@company.com"
                    required
                    aria-invalid={emailError}
                    onBlur={(e) => {
                      if (e.currentTarget.value !== "") setEmailError(!validEmail(e.currentTarget.value.trim()));
                    }}
                  />
                  <p className={`field-error${emailError ? " visible" : ""}`} role="alert">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4" />
                      <path d="M12 16h.01" />
                    </svg>
                    Please enter a valid email address.
                  </p>
                </div>
                <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={submitting}>
                  <span className="btn-label">{submitting ? "Sending…" : "Send it to me"}</span>
                </button>
                <p className="modal-fine">No spam. Unsubscribe anytime.</p>
              </form>
            </div>
          ) : (
            <div>
              <div className="success-check" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h3>Got it.</h3>
              <p className="modal-sub">We&apos;ll follow up with a breakdown built around your business.</p>
              <button type="button" className="btn btn-secondary" style={{ width: "100%" }} onClick={closeLeadModal}>
                Back to the video
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

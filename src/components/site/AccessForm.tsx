"use client";

import { useState } from "react";

/* Ported from js/funnel.js's early-access form: swaps to a success view
   on submit (no backend call today — same as the original). */
export function AccessForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    if (!name || !email) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="access-success">
        <div className="success-check" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h3>You&apos;re on the list.</h3>
        <p>We&apos;ll be in touch before launch. Reply to your confirmation email to get your sample now.</p>
      </div>
    );
  }

  return (
    <form className="access-form" noValidate onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="accessName">
          Name <span className="req" aria-hidden="true">*</span>
        </label>
        <input className="input" type="text" id="accessName" name="name" autoComplete="name" placeholder="Jane Smith" required />
      </div>
      <div className="field">
        <label htmlFor="accessEmail">
          Email <span className="req" aria-hidden="true">*</span>
        </label>
        <input className="input" type="email" id="accessEmail" name="email" autoComplete="email" placeholder="jane@agency.com" required />
      </div>
      <button type="submit" className="btn btn-glow btn-lg" style={{ width: "100%" }}>
        Get early access
      </button>
      <p className="access-fine">No spam. One email when it launches, one with your sample. Unsubscribe anytime.</p>
    </form>
  );
}

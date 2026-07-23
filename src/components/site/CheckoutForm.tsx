"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { setJSON } from "@/lib/storage";

const TRIAL_DAYS = 7;

function validEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function validExpiry(v: string) {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return false;
  const month = parseInt(m[1], 10);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const year = 2000 + parseInt(m[2], 10);
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function CheckoutForm() {
  const [paid, setPaid] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [trialEndDate, setTrialEndDate] = useState("");

  const [errors, setErrors] = useState({ email: false, name: false, card: false, exp: false, cvc: false, terms: false });

  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const expRef = useRef<HTMLInputElement>(null);
  const cvcRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  function check() {
    const results = {
      email: validEmail(emailRef.current?.value.trim() || ""),
      name: (nameRef.current?.value.trim().length || 0) > 1,
      card: (cardRef.current?.value.replace(/\D/g, "").length || 0) === 16,
      exp: validExpiry(expRef.current?.value || ""),
      cvc: /^\d{3,4}$/.test(cvcRef.current?.value || ""),
      terms: termsRef.current?.checked ?? false,
    };
    setErrors({
      email: !results.email,
      name: !results.name,
      card: !results.card,
      exp: !results.exp,
      cvc: !results.cvc,
      terms: !results.terms,
    });
    if (!results.email) return emailRef.current;
    if (!results.name) return nameRef.current;
    if (!results.card) return cardRef.current;
    if (!results.exp) return expRef.current;
    if (!results.cvc) return cvcRef.current;
    if (!results.terms) return termsRef.current;
    return null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const firstBad = check();
    if (firstBad) {
      firstBad.focus();
      return;
    }

    setProcessing(true);

    /* Simulated payment — replace with Stripe checkout later */
    setTimeout(() => {
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

      setJSON("bsl_order", {
        plan: "pro",
        amount: 297,
        email: emailRef.current?.value.trim().toLowerCase(),
        name: nameRef.current?.value.trim(),
        status: "trialing",
        trialDays: TRIAL_DAYS,
        trialStart: now.toISOString(),
        trialEnd: trialEnd.toISOString(),
        at: now.toISOString(),
      });

      setTrialEndDate(formatDate(trialEnd));
      setProcessing(false);
      setPaid(true);
    }, 1400);
  }

  if (paid) {
    return (
      <div>
        <div className="success-check" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 className="checkout-card-title">Your trial has started</h2>
        <p className="paid-sub">
          Your 7-day free trial of <strong>Onboarding OS Pro</strong> is active. First charge of $297 lands on <strong>{trialEndDate}</strong> unless you cancel. Create your account to open your dashboard and send your first onboarding link.
        </p>
        <Link href="/signup?plan=pro" className="btn btn-primary btn-lg" style={{ width: "100%" }}>
          Create your account
        </Link>
        <p className="modal-fine">We&apos;ll email you a reminder 2 days before your trial ends.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="checkout-card-title">Payment details</h2>
      <form noValidate onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="coEmail">
            Email <span className="req" aria-hidden="true">*</span>
          </label>
          <input className="input" type="email" id="coEmail" name="email" ref={emailRef} autoComplete="email" placeholder="jane@company.com" required aria-invalid={errors.email} />
          <p className={`field-error${errors.email ? " visible" : ""}`} role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
            Please enter a valid email address.
          </p>
          <p className="hint">Your receipt and account invite go here.</p>
        </div>
        <div className="field">
          <label htmlFor="coName">
            Name on card <span className="req" aria-hidden="true">*</span>
          </label>
          <input className="input" type="text" id="coName" name="name" ref={nameRef} autoComplete="cc-name" placeholder="Jane Smith" required aria-invalid={errors.name} />
          <p className={`field-error${errors.name ? " visible" : ""}`} role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
            Please enter the name on the card.
          </p>
        </div>
        <div className="field">
          <label htmlFor="coCard">
            Card number <span className="req" aria-hidden="true">*</span>
          </label>
          <input
            className="input"
            type="text"
            id="coCard"
            name="cardnumber"
            ref={cardRef}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4242 4242 4242 4242"
            maxLength={19}
            required
            aria-invalid={errors.card}
            onInput={(e) => {
              const digits = e.currentTarget.value.replace(/\D/g, "").slice(0, 16);
              e.currentTarget.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
            }}
          />
          <p className={`field-error${errors.card ? " visible" : ""}`} role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
            Please enter a 16-digit card number.
          </p>
        </div>
        <div className="pay-row">
          <div className="field">
            <label htmlFor="coExp">
              Expiry <span className="req" aria-hidden="true">*</span>
            </label>
            <input
              className="input"
              type="text"
              id="coExp"
              name="cc-exp"
              ref={expRef}
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              maxLength={5}
              required
              aria-invalid={errors.exp}
              onInput={(e) => {
                const digits = e.currentTarget.value.replace(/\D/g, "").slice(0, 4);
                e.currentTarget.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
              }}
            />
            <p className={`field-error${errors.exp ? " visible" : ""}`} role="alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
              Enter a valid future date.
            </p>
          </div>
          <div className="field">
            <label htmlFor="coCvc">
              CVC <span className="req" aria-hidden="true">*</span>
            </label>
            <input
              className="input"
              type="text"
              id="coCvc"
              name="cvc"
              ref={cvcRef}
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              maxLength={4}
              required
              aria-invalid={errors.cvc}
              onInput={(e) => {
                e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 4);
              }}
            />
            <p className={`field-error${errors.cvc ? " visible" : ""}`} role="alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
              3–4 digits.
            </p>
          </div>
        </div>
        <label className="tc-check" htmlFor="coTerms">
          <input type="checkbox" id="coTerms" name="terms" ref={termsRef} required aria-invalid={errors.terms} />
          <span>
            I agree to the <Link href="/terms" target="_blank" rel="noopener">Terms &amp; Conditions</Link> and <Link href="/privacy" target="_blank" rel="noopener">Privacy Policy</Link>, including the auto-charge after my 7-day trial.
          </span>
        </label>
        <p className={`field-error${errors.terms ? " visible" : ""}`} role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
          Please agree to the Terms &amp; Conditions to continue.
        </p>
        <button type="submit" className="btn btn-glow btn-lg" style={{ width: "100%" }} disabled={processing}>
          <span className="btn-label">{processing ? "Processing payment…" : "Start my 7-day free trial"}</span>
        </button>
        <p className="modal-fine">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Free for 7 days, then $297/month, billed automatically unless you cancel. No contracts — cancel anytime from your dashboard.
        </p>
        <p className="test-note">Test mode — payments are simulated in this demo. No card is charged.</p>
      </form>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { callProvisionProfile } from "@/lib/edgeFunctions";
import { PLAN_CREDITS, TRIAL_DAYS } from "@/lib/featureGating";
import { FormAlert } from "./FormAlert";
import { PasswordField } from "./PasswordField";

function validEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function loginUrl() {
  return `${window.location.origin}/login`;
}

function passwordScore(v: string) {
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  return score;
}

export function SignupForm() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [alert, setAlert] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwScore, setPwScore] = useState(0);

  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [pwError, setPwError] = useState(false);
  const [termsError, setTermsError] = useState(false);

  const [success, setSuccess] = useState<{ name: string; subText: string | null } | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  async function provisionProfile() {
    try {
      await callProvisionProfile(supabase);
    } catch {
      // best-effort backstop — getPlan() in the Edge Functions lazily
      // creates a default trial row on first authenticated call too,
      // so a failure here doesn't leave the account unprovisioned
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAlert("");

    const name = nameRef.current?.value.trim() || "";
    const email = emailRef.current?.value.trim() || "";
    const password = passwordRef.current?.value || "";

    const nameOk = name.length > 1;
    const emailOk = validEmail(email);
    const pwOk = password.length >= 8;
    const termsOk = termsRef.current?.checked ?? false;

    setNameError(!nameOk);
    setEmailError(!emailOk);
    setPwError(!pwOk);
    setTermsError(!termsOk);

    const firstBad = !nameOk ? nameRef.current : !emailOk ? emailRef.current : !pwOk ? passwordRef.current : !termsOk ? termsRef.current : null;
    if (firstBad) {
      firstBad.focus();
      return;
    }

    const lowerEmail = email.toLowerCase();

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: lowerEmail,
      password,
      options: { data: { name }, emailRedirectTo: loginUrl() },
    });
    setBusy(false);

    if (error) {
      setAlert(error.message);
      return;
    }

    const user = data.user;
    if (user && user.identities && user.identities.length === 0) {
      setAlert("An account with this email already exists. Try logging in instead.");
      emailRef.current?.focus();
      return;
    }

    if (data.session) {
      await provisionProfile();
      setSuccess({ name, subText: null });
      setTimeout(() => router.push("/app/agent"), 1400);
    } else {
      setSuccess({
        name,
        subText: `Almost there — we sent a confirmation link to ${lowerEmail}. Click it, then log in.`,
      });
    }
  }

  if (success) {
    return (
      <div className="auth-success">
        <div className="success-check" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1>Account created!</h1>
        <p className="auth-sub">
          {success.subText ?? (
            <>Welcome aboard, {success.name.split(" ")[0]}. Taking you to your dashboard…</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Create your account</h1>
      <p className="auth-sub">Start onboarding clients on autopilot in under 10 minutes.</p>

      <div className="plan-strip">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span>{TRIAL_DAYS}-day free trial · {PLAN_CREDITS.trial.toLocaleString()} credits included · no card required</span>
      </div>

      <FormAlert message={alert} />

      <form noValidate onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="suName">
            Full name <span className="req" aria-hidden="true">*</span>
          </label>
          <input
            className="input"
            type="text"
            id="suName"
            name="name"
            ref={nameRef}
            autoComplete="name"
            placeholder="Jane Smith"
            required
            aria-invalid={nameError}
            onBlur={(e) => {
              if (e.currentTarget.value !== "") setNameError(e.currentTarget.value.trim().length <= 1);
            }}
          />
          <p className={`field-error${nameError ? " visible" : ""}`} role="alert">Please enter your full name.</p>
        </div>
        <div className="field">
          <label htmlFor="suEmail">
            Work email <span className="req" aria-hidden="true">*</span>
          </label>
          <input
            className="input"
            type="email"
            id="suEmail"
            name="email"
            ref={emailRef}
            autoComplete="email"
            placeholder="jane@company.com"
            required
            aria-invalid={emailError}
            onBlur={(e) => {
              if (e.currentTarget.value !== "") setEmailError(!validEmail(e.currentTarget.value.trim()));
            }}
          />
          <p className={`field-error${emailError ? " visible" : ""}`} role="alert">Please enter a valid email address.</p>
        </div>
        <div className="field">
          <label htmlFor="suPassword">
            Password <span className="req" aria-hidden="true">*</span>
          </label>
          <PasswordField
            id="suPassword"
            name="password"
            ref={passwordRef}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            minLength={8}
            aria-invalid={pwError}
            onChange={(e) => setPwScore(passwordScore(e.currentTarget.value))}
            onBlur={(e) => {
              if (e.currentTarget.value !== "") setPwError(e.currentTarget.value.length < 8);
            }}
          />
          <div className={`pw-meter${pwScore ? ` s${pwScore}` : ""}`} aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <p className="hint">Use 8+ characters with a mix of letters, numbers &amp; symbols.</p>
          <p className={`field-error${pwError ? " visible" : ""}`} role="alert">Password must be at least 8 characters.</p>
        </div>

        <label className="tc-check" htmlFor="suTerms">
          <input type="checkbox" id="suTerms" name="terms" ref={termsRef} required aria-invalid={termsError} onChange={() => setTermsError(false)} />
          <span>
            I agree to the <Link href="/terms" target="_blank" rel="noopener">Terms &amp; Conditions</Link> and <Link href="/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.
          </span>
        </label>
        <p className={`field-error${termsError ? " visible" : ""}`} role="alert">Please agree to the Terms &amp; Conditions to continue.</p>

        <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
          <span className="btn-label">{busy ? "Creating account…" : "Create account"}</span>
        </button>
      </form>
      <p className="auth-footer-link">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}

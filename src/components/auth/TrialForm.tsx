"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { callProvisionProfile } from "@/lib/edgeFunctions";
import { FormAlert } from "./FormAlert";
import { PasswordField } from "./PasswordField";

type View = "start" | "login";

const TRIAL_DAYS = 7;

function validEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function loginUrl() {
  return `${window.location.origin}/trial`;
}

function trialEndFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d.toISOString();
}

export function TrialForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());

  // searchParams is stable across the server/client render of this
  // Suspense-wrapped component, so the "?expired=1" deep link can be
  // read directly in the initializer instead of an effect.
  const expired = searchParams.get("expired") === "1";
  const [view, setView] = useState<View>(expired ? "login" : "start");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ name: string; subText: string | null } | null>(null);

  const [startAlert, setStartAlert] = useState("");
  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [pwError, setPwError] = useState(false);
  const [termsError, setTermsError] = useState(false);

  const [loginAlert, setLoginAlert] = useState(
    expired ? "Your 7-day trial ended. Log back in to check for an extension, or reach out for full access." : ""
  );
  const [loginEmailError, setLoginEmailError] = useState(false);
  const [loginPwError, setLoginPwError] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const loginEmailRef = useRef<HTMLInputElement>(null);
  const loginPasswordRef = useRef<HTMLInputElement>(null);

  function goToLogin() {
    setView("login");
    setStartAlert("");
    setTimeout(() => loginEmailRef.current?.focus(), 0);
  }

  function goToStart() {
    setView("start");
    setLoginAlert("");
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  async function handleStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStartAlert("");

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
    const trialEnd = trialEndFromNow();

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: lowerEmail,
      password,
      options: {
        data: { name, trial: true, trialEnd },
        emailRedirectTo: loginUrl(),
      },
    });
    setBusy(false);

    if (error) {
      setStartAlert(error.message);
      return;
    }

    const user = data.user;
    if (user && user.identities && user.identities.length === 0) {
      setStartAlert("A trial already exists for this email. Try logging in instead.");
      emailRef.current?.focus();
      return;
    }

    if (data.session) {
      try {
        // Trial accounts get every feature switched on (mirrors PLANS.full)
        // so warm leads can explore the whole product — seeded server-side
        // in profiles.features by provision-profile's featuresForPlan().
        await callProvisionProfile(supabase, "full");
      } catch {
        // best-effort backstop, same as the paid signup flow — getPlan()
        // lazily creates a 'starter' row on first authenticated call
      }
      setSuccess({ name, subText: null });
      setTimeout(() => router.push("/app/agent"), 1400);
    } else {
      setSuccess({
        name,
        subText: `Almost there — we sent a confirmation link to ${lowerEmail}. Click it, then log back in here.`,
      });
    }
  }

  async function handleTrialLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginAlert("");

    const email = loginEmailRef.current?.value.trim() || "";
    const password = loginPasswordRef.current?.value || "";
    const emailOk = validEmail(email);
    const pwOk = password.length > 0;
    setLoginEmailError(!emailOk);
    setLoginPwError(!pwOk);
    if (!emailOk) {
      loginEmailRef.current?.focus();
      return;
    }
    if (!pwOk) {
      loginPasswordRef.current?.focus();
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (error) {
      setBusy(false);
      setLoginAlert("Email or password is incorrect. Check both and try again.");
      loginPasswordRef.current?.focus();
      return;
    }

    const trialEnd = data.user.user_metadata?.trialEnd as string | undefined;
    if (trialEnd && new Date(trialEnd) <= new Date()) {
      await supabase.auth.signOut();
      setBusy(false);
      setLoginAlert("Your 7-day trial has ended. Reach out to us if you'd like full access.");
      return;
    }

    setBusy(false);
    router.push("/app");
    router.refresh();
  }

  if (success) {
    return (
      <div className="auth-success">
        <div className="success-check" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1>Your trial has started!</h1>
        <p className="auth-sub">
          {success.subText ?? <>Welcome aboard, {success.name.split(" ")[0]}. Taking you to your dashboard…</>}
        </p>
      </div>
    );
  }

  if (view === "login") {
    return (
      <div>
        <h1>Log in to your trial</h1>
        <p className="auth-sub">Pick up where you left off.</p>

        <FormAlert message={loginAlert} />

        <form noValidate onSubmit={handleTrialLogin}>
          <div className="field">
            <label htmlFor="tlEmail">
              Email <span className="req" aria-hidden="true">*</span>
            </label>
            <input
              className="input"
              type="email"
              id="tlEmail"
              name="email"
              ref={loginEmailRef}
              autoComplete="email"
              placeholder="jane@company.com"
              required
              aria-invalid={loginEmailError}
            />
            <p className={`field-error${loginEmailError ? " visible" : ""}`} role="alert">Please enter a valid email address.</p>
          </div>
          <div className="field">
            <label htmlFor="tlPassword">
              Password <span className="req" aria-hidden="true">*</span>
            </label>
            <PasswordField
              id="tlPassword"
              ref={loginPasswordRef}
              autoComplete="current-password"
              placeholder="Your password"
              required
              aria-invalid={loginPwError}
            />
            <p className={`field-error${loginPwError ? " visible" : ""}`} role="alert">Please enter your password.</p>
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
            <span className="btn-label">{busy ? "Logging in…" : "Log in"}</span>
          </button>
        </form>
        <p className="auth-footer-link">
          Don&apos;t have a trial account yet?{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); goToStart(); }}>Start your trial</a>
        </p>
      </div>
    );
  }

  return (
    <div>
      <span className="plan-strip">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span>7-day full-access trial · no card, no charge</span>
      </span>
      <h1>Start your trial</h1>
      <p className="auth-sub">You&apos;ve got 7 days of full access. It ends automatically — nothing to cancel.</p>

      <FormAlert message={startAlert} />

      <form noValidate onSubmit={handleStart}>
        <div className="field">
          <label htmlFor="tsName">
            Full name <span className="req" aria-hidden="true">*</span>
          </label>
          <input
            className="input"
            type="text"
            id="tsName"
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
          <label htmlFor="tsEmail">
            Email <span className="req" aria-hidden="true">*</span>
          </label>
          <input
            className="input"
            type="email"
            id="tsEmail"
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
          <label htmlFor="tsPassword">
            Password <span className="req" aria-hidden="true">*</span>
          </label>
          <PasswordField
            id="tsPassword"
            name="password"
            ref={passwordRef}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            minLength={8}
            aria-invalid={pwError}
            onBlur={(e) => {
              if (e.currentTarget.value !== "") setPwError(e.currentTarget.value.length < 8);
            }}
          />
          <p className={`field-error${pwError ? " visible" : ""}`} role="alert">Password must be at least 8 characters.</p>
        </div>

        <label className="tc-check" htmlFor="tsTerms">
          <input type="checkbox" id="tsTerms" name="terms" ref={termsRef} required aria-invalid={termsError} onChange={() => setTermsError(false)} />
          <span>I agree to the <a href="/terms" target="_blank" rel="noopener">Terms &amp; Conditions</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span>
        </label>
        <p className={`field-error${termsError ? " visible" : ""}`} role="alert">Please agree to the Terms &amp; Conditions to continue.</p>

        <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
          <span className="btn-label">{busy ? "Starting trial…" : "Start my 7-day trial"}</span>
        </button>
      </form>
      <p className="auth-footer-link">
        Already started your trial?{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); goToLogin(); }}>Log in</a>
      </p>
    </div>
  );
}

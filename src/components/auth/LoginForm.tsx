"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FormAlert } from "./FormAlert";
import { PasswordField } from "./PasswordField";

type View = "login" | "reset" | "newPw" | "sent";

function validEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function loginUrl() {
  return `${window.location.origin}/login`;
}

export function LoginForm() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [view, setView] = useState<View>("login");
  const [busy, setBusy] = useState(false);

  const [loginAlert, setLoginAlert] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const [resetAlert, setResetAlert] = useState("");
  const [resetEmailError, setResetEmailError] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const [newPwError, setNewPwError] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("your account");

  const loginEmailRef = useRef<HTMLInputElement>(null);
  const resetEmailRef = useRef<HTMLInputElement>(null);
  const newPwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryEmail(session?.user?.email || "your account");
        setView("newPw");
        setTimeout(() => newPwRef.current?.focus(), 0);
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginAlert("");
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const emailOk = validEmail(email);
    const pwOk = password.length > 0;
    setEmailError(!emailOk);
    setPasswordError(!pwOk);
    if (!emailOk) {
      loginEmailRef.current?.focus();
      return;
    }
    if (!pwOk) return;

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });
    setBusy(false);

    if (error) {
      const msg = /email not confirmed/i.test(error.message)
        ? "Please confirm your email first — check your inbox for the confirmation link."
        : "Email or password is incorrect. Check both and try again, or reset your password.";
      setLoginAlert(msg);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  function handleForgot(e: React.MouseEvent) {
    e.preventDefault();
    if (loginEmailRef.current) resetEmailRef.current!.value = loginEmailRef.current.value;
    setView("reset");
    setTimeout(() => resetEmailRef.current?.focus(), 0);
  }

  function handleBackToLogin(e: React.MouseEvent) {
    e.preventDefault();
    setView("login");
    setTimeout(() => loginEmailRef.current?.focus(), 0);
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetAlert("");
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const emailOk = validEmail(email);
    setResetEmailError(!emailOk);
    if (!emailOk) return;

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
      redirectTo: loginUrl(),
    });
    setBusy(false);

    if (error) {
      setResetAlert(error.message);
      return;
    }
    setSentEmail(email);
    setView("sent");
  }

  async function handleNewPw(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = newPwRef.current?.value || "";
    const ok = password.length >= 8;
    setNewPwError(!ok);
    if (!ok) return;

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setView("login");
      setLoginAlert(`Couldn't update the password: ${error.message}`);
      return;
    }

    router.push("/app"); // recovery leaves the user logged in
    router.refresh();
  }

  return (
    <>
      {view === "login" && (
        <div>
          <h1>Welcome back</h1>
          <p className="auth-sub">Log in to your Onboarding OS dashboard.</p>

          <FormAlert message={loginAlert} />

          <form noValidate onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="liEmail">
                Email <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                className="input"
                type="email"
                id="liEmail"
                name="email"
                ref={loginEmailRef}
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
              <div className="row-between">
                <label htmlFor="liPassword">
                  Password <span className="req" aria-hidden="true">*</span>
                </label>
                <a href="#" className="link-sm" onClick={handleForgot}>Forgot password?</a>
              </div>
              <PasswordField
                id="liPassword"
                name="password"
                autoComplete="current-password"
                placeholder="Your password"
                required
                aria-invalid={passwordError}
                onBlur={(e) => {
                  if (e.currentTarget.value !== "") setPasswordError(e.currentTarget.value.length === 0);
                }}
              />
              <p className={`field-error${passwordError ? " visible" : ""}`} role="alert">Please enter your password.</p>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
              <span className="btn-label">{busy ? "Logging in…" : "Log in"}</span>
            </button>
          </form>
          <p className="auth-footer-link">
            New to Onboarding OS? <Link href="/checkout">Create an account</Link>
          </p>
        </div>
      )}

      {view === "reset" && (
        <div>
          <h1>Reset your password</h1>
          <p className="auth-sub">Enter your account email and we&apos;ll send you a reset link.</p>

          <FormAlert message={resetAlert} />

          <form noValidate onSubmit={handleReset}>
            <div className="field">
              <label htmlFor="rsEmail">
                Email <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                className="input"
                type="email"
                id="rsEmail"
                name="email"
                ref={resetEmailRef}
                autoComplete="email"
                placeholder="jane@company.com"
                required
                aria-invalid={resetEmailError}
              />
              <p className={`field-error${resetEmailError ? " visible" : ""}`} role="alert">Please enter a valid email address.</p>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
              <span className="btn-label">{busy ? "Sending…" : "Send reset link"}</span>
            </button>
          </form>
          <p className="auth-footer-link">
            <a href="#" onClick={handleBackToLogin}>← Back to log in</a>
          </p>
        </div>
      )}

      {view === "newPw" && (
        <div>
          <h1>Choose a new password</h1>
          <p className="auth-sub">
            For <strong>{recoveryEmail}</strong>
          </p>

          <form noValidate onSubmit={handleNewPw}>
            <div className="field">
              <label htmlFor="npPassword">
                New password <span className="req" aria-hidden="true">*</span>
              </label>
              <PasswordField
                id="npPassword"
                ref={newPwRef}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                minLength={8}
                aria-invalid={newPwError}
              />
              <p className={`field-error${newPwError ? " visible" : ""}`} role="alert">Password must be at least 8 characters.</p>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
              <span className="btn-label">{busy ? "Updating…" : "Update password"}</span>
            </button>
          </form>
        </div>
      )}

      {view === "sent" && (
        <div className="auth-success">
          <div className="success-check" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1>Check your inbox</h1>
          <p className="auth-sub">
            We sent a reset link to <strong>{sentEmail}</strong>.
          </p>
        </div>
      )}
    </>
  );
}

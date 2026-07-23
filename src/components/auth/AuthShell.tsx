import type { ReactNode } from "react";
import Link from "next/link";

function AuthDecor() {
  return (
    <div className="auth-decor" aria-hidden="true">
      <span className="dec dec-ring" />
      <span className="dec dec-orbit"><i /></span>
      <span className="dec dec-orb" />
      <span className="dec dec-hex">
        <svg width="74" height="84" viewBox="0 0 74 84" fill="none">
          <path d="M37 2 71 22v40L37 82 3 62V22L37 2z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="37" cy="42" r="7" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      </span>
      <span className="dec dec-cube" />
      <span className="dec dec-plus" />
      <span className="dec dec-dot dot-1" />
      <span className="dec dec-dot dot-2" />
      <span className="dec dec-dot dot-3" />
    </div>
  );
}

const iconBoxStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  borderRadius: 10,
  background: "linear-gradient(135deg,var(--primary),var(--accent))",
  color: "#fff",
} as const;

export function AuthBrandIcon() {
  return (
    <span aria-hidden="true" style={iconBoxStyle}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a5 5 0 0 1 5 5v1h1a3 3 0 0 1 0 6h-1v1a5 5 0 0 1-10 0v-1H6a3 3 0 0 1 0-6h1V7a5 5 0 0 1 5-5z" />
      </svg>
    </span>
  );
}

export function DefaultAuthBrand() {
  return (
    <Link href="/" className="brand" aria-label="Back to Onboarding OS home">
      <AuthBrandIcon />
      <span
        className="brand-name"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}
      >
        Onboarding <span style={{ color: "var(--primary)" }}>OS</span>
      </span>
    </Link>
  );
}

export function AuthShell({
  children,
  brand,
}: {
  children: ReactNode;
  brand?: ReactNode;
}) {
  return (
    <>
      <AuthDecor />
      <header className="auth-header">{brand ?? <DefaultAuthBrand />}</header>

      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>

      <footer className="auth-legal-footer">
        <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
      </footer>

      <div className="toast-region" aria-live="polite" />
    </>
  );
}

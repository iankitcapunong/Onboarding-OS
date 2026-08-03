import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/site/BrandMark";
import { SiteFooter } from "@/components/site/SiteFooter";
import { PowerBackdrop } from "@/components/site/PowerBackdrop";
import { PowerHeroImg } from "@/components/site/PowerHeroImg";
import { PageMotion } from "@/components/site/PageMotion";
import { DemoVsl } from "@/components/site/DemoVsl";

export const metadata: Metadata = {
  title: "Onboarding OS · Watch the Demo",
  description:
    "Watch Onboarding OS run a real client onboarding — the interview, the dashboard, and the marketing assets it generates. Then start your 7-day free trial.",
};

export default function DemoPage() {
  return (
    <div className="power">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <PowerBackdrop />

      <header className="site-nav" id="siteNav">
        <div className="container nav-inner">
          <BrandMark href="/" />
          <div className="nav-actions">
            <Link href="/login" className="nav-login">Log in</Link>
            <Link href="/checkout" className="btn btn-primary btn-sm">Start free trial</Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <PowerHeroImg />
          <div className="container hero-inner">
            <span className="badge badge-hero">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              See it in action
            </span>
            <h1>
              Watch Onboarding OS run<br className="br-desktop" /> a <span className="hl">real client onboarding</span>.
            </h1>
            <p className="hero-sub">
              One recording, three to five real business use cases — the onboarding interview, the dashboard it fills in, and the assets it generates. No sales call required to see it work.
            </p>

            <DemoVsl />

            <div className="hero-ctas">
              <Link href="/" className="btn btn-ghost-light btn-lg">← Back to the overview</Link>
            </div>
            <p className="hero-note">
              Already sure? <Link href="/checkout">Skip ahead and start your free trial →</Link>
            </p>
          </div>
        </section>

        <section className="section" id="whats-inside">
          <div className="container">
            <div className="section-head">
              <span className="badge badge-soft">In this walkthrough</span>
              <h2>What you&apos;ll see happen</h2>
              <p className="section-sub">The exact flow your own clients go through, start to finish.</p>
            </div>
            <div className="grid-3">
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </div>
                <h3>The client-facing interview</h3>
                <p>A client works through the onboarding flow on their own time — goals, offer, audience, and brand voice captured without a single call.</p>
              </article>
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
                </div>
                <h3>Your dashboard, filling in live</h3>
                <p>Sessions, transcripts, and simple analytics landing in one place while the interview is still running.</p>
              </article>
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <h3>The assets it hands you back</h3>
                <p>Email copy, ad copy, and landing page copy generated from that one interview — ready to review the same day.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section final-cta">
          <div className="container">
            <h2>Like what you saw?<br />Your own onboarding link is minutes away.</h2>
            <div className="hero-ctas">
              <Link href="/checkout" className="btn btn-glow btn-lg">
                Start your 7-day free trial
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
              <Link href="/login" className="btn btn-ghost-light btn-lg">Log in</Link>
            </div>
            <p className="hero-note">Card required to start · $0 due today · cancel anytime before day 7. Your account is created once your trial starts.</p>
          </div>
        </section>
      </main>

      <SiteFooter
        links={[
          { href: "/", label: "What's inside" },
          { href: "/checkout", label: "Pricing" },
          { href: "/login", label: "Log in" },
          { href: "/terms", label: "Terms" },
          { href: "/privacy", label: "Privacy" },
        ]}
      />

      <div className="toast-region" id="toastRegion" aria-live="polite" />

      <PageMotion />
    </div>
  );
}

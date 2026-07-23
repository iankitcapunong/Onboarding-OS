import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/site/BrandMark";
import { SiteFooter } from "@/components/site/SiteFooter";
import { BgGlobe } from "@/components/site/BgGlobe";
import { PageMotion } from "@/components/site/PageMotion";
import { AccessForm } from "@/components/site/AccessForm";

export const metadata: Metadata = {
  title: "Onboarding OS · Get Early Access",
  description:
    "Be first to run Onboarding OS on your business. Drop your name and email for priority access and a free sample built for you.",
};

export default function FunnelPage() {
  return (
    <div className="funnel-body">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <BgGlobe />

      <header className="site-nav" id="siteNav">
        <div className="container nav-inner">
          <BrandMark href="/funnel" />
          <div className="nav-actions">
            <Link href="/login" className="nav-login">Log in</Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="funnel-access" id="access" aria-label="Early access">
          <div className="container">
            <div className="access-split">
              <div className="hero-left">
                <span className="badge badge-hero">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Early access
                </span>
                <h1>
                  Be first to run <span className="text-gradient">Onboarding OS</span> on your business.
                </h1>
                <p className="hero-sub">Stop losing weeks chasing clients for the same information. Drop your name and email — we&apos;ll let you know the moment it&apos;s live, and send you a sample built for your business.</p>
                <ul className="access-perks">
                  <li>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8"><path d="M20 6 9 17l-5-5" /></svg>
                    Priority access before public launch
                  </li>
                  <li>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8"><path d="M20 6 9 17l-5-5" /></svg>
                    Sample breakdown built for your business
                  </li>
                  <li>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8"><path d="M20 6 9 17l-5-5" /></svg>
                    Early-access pricing, first to know
                  </li>
                </ul>
              </div>

              <div className="access-right">
                <AccessForm />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter
        links={[
          { href: "/", label: "See what's inside" },
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

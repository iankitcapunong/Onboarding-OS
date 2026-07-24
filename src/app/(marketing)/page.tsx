import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/site/BrandMark";
import { SiteFooter } from "@/components/site/SiteFooter";
import { BgGlobe } from "@/components/site/BgGlobe";
import { PageMotion } from "@/components/site/PageMotion";

export const metadata: Metadata = {
  title: "Onboarding OS · The System for Client Onboarding",
  description:
    "What's inside Onboarding OS: a system that interviews your clients, captures every detail, and generates marketing assets — email copy, ad copy, landing pages and more.",
};

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <BgGlobe />

      <header className="site-nav" id="siteNav">
        <div className="container nav-inner">
          <BrandMark href="/" />
          <nav aria-label="Primary">
            <ul className="nav-links">
              <li><a href="#how">How it works</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="#results">Results</a></li>
              <li><Link href="/checkout">Pricing</Link></li>
            </ul>
          </nav>
          <div className="nav-actions">
            <Link href="/login" className="nav-login">Log in</Link>
            <Link href="/demo" className="btn btn-primary btn-sm">Watch the demo</Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <div className="container hero-inner">
            <span className="badge badge-hero">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              AI-powered client onboarding
            </span>
            <h1>
              Still losing 6+ hours onboarding<br className="br-desktop" /> every new client by hand?
            </h1>
            <p className="hero-sub">
              Onboarding OS interviews your clients, captures every detail, and generates your email copy, ad copy, and landing page copy. Automatically, in minutes.
            </p>

            <div className="hero-ctas">
              <Link href="/demo" className="btn btn-glow btn-lg">
                Watch the demo
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 3 14 9-14 9V3z" />
                </svg>
              </Link>
              <a href="#features" className="btn btn-ghost-light btn-lg">See what&apos;s inside</a>
            </div>
            <p className="hero-note">A full tour of the platform — the onboarding flow, the dashboard, and everything it generates</p>
          </div>
        </section>

        <section className="proof-strip" aria-label="Trusted by">
          <div className="container">
            <p className="proof-label">Being tested right now by partner businesses in</p>
            <ul className="proof-tags">
              <li>Real estate</li><li>Coaching</li><li>Marketing agencies</li><li>Local services</li><li>E-commerce</li>
            </ul>
          </div>
        </section>

        <section className="section" id="pain">
          <div className="container">
            <div className="section-head">
              <span className="badge badge-soft">The problem</span>
              <h2>Manual onboarding is quietly killing your margins</h2>
              <p className="section-sub">Whoever you are, a new client starts the same way — chasing the same information by hand. Here&apos;s what that&apos;s actually costing you.</p>
            </div>
            <div className="grid-3">
              <article className="card pain-card">
                <div className="card-icon icon-danger" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <h3>Agencies: chasing the same intake, every client</h3>
                <p>Discovery calls, intake forms, back-and-forth emails. Copywriters and media buyers sit idle for days waiting on one missing answer before a campaign can even start.</p>
              </article>
              <article className="card pain-card">
                <div className="card-icon icon-danger" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /><path d="M8 11h6" /></svg>
                </div>
                <h3>SaaS companies: repeating the same walkthrough, every signup</h3>
                <p>New customers stall waiting on a manual demo or setup call. Time-to-value slips, and support fields the same onboarding questions week after week.</p>
              </article>
              <article className="card pain-card">
                <div className="card-icon icon-danger" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 17h6v-6" /><path d="m22 17-8.5-8.5-5 5L2 7" /></svg>
                </div>
                <h3>Regular businesses: losing the first week to intake</h3>
                <p>Interviews, forms, and phone tag before the work even starts. A slow, clunky first week is exactly when a new client decides whether to stay.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section-alt" id="how">
          <div className="container">
            <div className="section-head">
              <span className="badge badge-soft">The solution</span>
              <h2>One system. Your whole onboarding, done.</h2>
              <p className="section-sub">Your client works through your branded onboarding flow. And everything downstream happens automatically.</p>
            </div>
            <ol className="steps">
              <li className="step">
                <span className="step-num" aria-hidden="true">1</span>
                <h3>Client works through your onboarding flow</h3>
                <p>Send one link. The system runs a natural, friendly interview that captures goals, offer, audience, and brand voice. No forms, no calls.</p>
              </li>
              <li className="step">
                <span className="step-num" aria-hidden="true">2</span>
                <h3>Everything lands in your dashboard</h3>
                <p>Sessions, answers, and simple analytics in one place. No GoHighLevel required. Nothing gets lost, nothing needs chasing.</p>
              </li>
              <li className="step">
                <span className="step-num" aria-hidden="true">3</span>
                <h3>Assets are generated for you</h3>
                <p>Email copy, ad copy, and landing page copy. Generated from the interview, ready to review, edit, and ship the same day.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="section section-dark" id="results">
          <div className="container">
            <div className="section-head">
              <span className="badge badge-hero">Results in numbers</span>
              <h2>What automated onboarding actually buys you</h2>
            </div>
            <div className="stats-row">
              <div className="stat">
                <span className="stat-value"><span className="count" data-count="6">0</span>+ hrs</span>
                <span className="stat-label">saved per client onboarded</span>
              </div>
              <div className="stat">
                <span className="stat-value">$<span className="count" data-count="1200">0</span></span>
                <span className="stat-label">avg. labor cost saved per month</span>
              </div>
              <div className="stat">
                <span className="stat-value"><span className="count" data-count="3">0</span>×</span>
                <span className="stat-label">faster from signed to launched</span>
              </div>
              <div className="stat">
                <span className="stat-value"><span className="count" data-count="24">0</span>/7</span>
                <span className="stat-label">the system never sleeps</span>
              </div>
            </div>
            <p className="stats-note">Figures from internal pilot usage. Partner case studies in progress. Real numbers published as they land.</p>
          </div>
        </section>

        <section className="section" id="features">
          <div className="container">
            <div className="section-head">
              <span className="badge badge-soft">Inside the platform</span>
              <h2>What&apos;s inside Onboarding OS</h2>
              <p className="section-sub">Every part of the platform, explained. This is what you and your clients work with day to day.</p>
            </div>
            <div className="grid-3">
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
                </div>
                <h3>Dashboard</h3>
                <p>Every onboarding session, simple analytics, and all your generated assets in one clean place. No extra tools required.</p>
              </article>
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </div>
                <h3>Onboarding flow &amp; call logs</h3>
                <p>A natural interview that captures business, offer, audience, goal and brand voice. Every session is logged with its transcript.</p>
              </article>
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </div>
                <h3>Prompt playground</h3>
                <p>Change what the system does in plain English — turn it into a receptionist or a screening interviewer with one sentence. No developer needed.</p>
              </article>
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <h3>Marketing assets</h3>
                <p>Email sequences, ad copy and landing page copy generated from the interview — with built-in spintax so every send can vary its wording.</p>
              </article>
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
                </div>
                <h3>Website builder</h3>
                <p>Describe a site in chat and get a clean landing page for your client — restyle it with a sentence, then download the HTML and publish anywhere.</p>
              </article>
              <article className="card feat-card">
                <div className="card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                </div>
                <h3>Creative studio</h3>
                <p>Generate ad images and short videos with curated AI models, pre-selected and managed for you. No API keys, no configuration.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section-alt" id="testimonials">
          <div className="container">
            <div className="section-head">
              <span className="badge badge-soft">Early access</span>
              <h2>What beta partners are saying</h2>
            </div>
            <div className="grid-3">
              <blockquote className="card quote-card">
                <p>&quot;It asked our new client better questions than our own intake form. We had usable ad copy the same afternoon.&quot;</p>
                <footer><strong>Beta partner</strong> · Marketing agency</footer>
              </blockquote>
              <blockquote className="card quote-card">
                <p>&quot;Onboarding used to take us a full week of back-and-forth. Now the client does it in one sitting, on their own time.&quot;</p>
                <footer><strong>Beta partner</strong> · Coaching business</footer>
              </blockquote>
              <blockquote className="card quote-card">
                <p>&quot;I changed what the system does with one sentence in plain English and it just… changed. No developer needed.&quot;</p>
                <footer><strong>Beta partner</strong> · Local services</footer>
              </blockquote>
            </div>
          </div>
        </section>

        <section className="section section-alt" id="faq">
          <div className="container container-narrow">
            <div className="section-head">
              <span className="badge badge-soft">FAQ</span>
              <h2>Questions, answered</h2>
            </div>
            <div className="faq-list">
              <details className="faq-item">
                <summary>What is Onboarding OS?</summary>
                <p>A complete onboarding system, not just one agent. Your client works through a branded onboarding flow that interviews them like a sharp operations lead, and everything downstream — session logs, analytics, and marketing assets — is generated and organized for you automatically.</p>
              </details>
              <details className="faq-item">
                <summary>Who is it for?</summary>
                <p>Agencies chasing the same intake for every client, SaaS companies repeating the same onboarding walkthrough for every signup, and local or service businesses running interviews by hand. If every new client or user starts with the same hours-long process, this is built for you.</p>
              </details>
              <details className="faq-item">
                <summary>Do I need GoHighLevel or any other tool?</summary>
                <p>No. Onboarding OS is fully standalone. Sessions, analytics, and generated assets all live in your dashboard.</p>
              </details>
              <details className="faq-item">
                <summary>Which AI models does it use?</summary>
                <p>Your plan includes three curated, top-ranked models we manage for you. No API keys, no per-token billing, no setup.</p>
              </details>
              <details className="faq-item">
                <summary>Can I change what the system does?</summary>
                <p>Yes. Describe the change in plain English, test it live in preview mode, and publish when it&apos;s right.</p>
              </details>
              <details className="faq-item">
                <summary>What assets does it generate?</summary>
                <p>Email sequences, ad copy, and landing page copy — all with spintax variants built in. The website builder turns a chat description into a downloadable landing page, and the creative studio generates ad images and videos.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="section final-cta">
          <div className="container">
            <h2>That&apos;s what&apos;s inside.<br />Ready to take a look around?</h2>
            <div className="hero-ctas">
              <Link href="/demo" className="btn btn-glow btn-lg">Watch the demo</Link>
              <Link href="/login" className="btn btn-ghost-light btn-lg">Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter
        links={[
          { href: "/demo", label: "Watch the demo" },
          { href: "/checkout", label: "Pricing" },
          { href: "/funnel", label: "Join the waitlist" },
          { href: "/login", label: "Log in" },
          { href: "/checkout", label: "Sign up" },
          { href: "/trial", label: "Trial access" },
          { href: "/terms", label: "Terms" },
          { href: "/privacy", label: "Privacy" },
        ]}
      />

      <div className="toast-region" id="toastRegion" aria-live="polite" />

      <PageMotion />
    </>
  );
}

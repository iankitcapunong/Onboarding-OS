import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/site/BrandMark";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Get started · Onboarding OS Pro",
  description:
    "Start your 7-day free trial of Onboarding OS Pro. Create your account, then complete secure payment through Stripe. Cancel anytime.",
};

/* The old page here rendered a SIMULATED card form (CheckoutForm) that
   validated digits locally and wrote a fake order to localStorage. Real
   payment now runs through Stripe Checkout from /app/billing after
   signup — account first, then payment, so the Stripe customer is
   always tied to a real signed-in user instead of matched by email
   later. This page just frames the offer and hands off to /signup. */
export default function CheckoutPage() {
  return (
    <div className="checkout-body">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      {/* Static night-sky backdrop (no canvas on checkout — keep it calm) */}
      <div className="page-scene" aria-hidden="true">
        <div className="hero-nebula" />
        <div className="hero-stars" />
      </div>

      <header className="site-nav" id="siteNav">
        <div className="container nav-inner">
          <BrandMark href="/" />
          <span className="secure-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Secure checkout via Stripe
          </span>
        </div>
      </header>

      <main id="main" className="checkout-main">
        <div className="container">
          <div className="checkout-head">
            <h1>Start your 7-day free trial</h1>
            <p>Create your account first — then complete payment through Stripe&apos;s secure checkout. You won&apos;t be charged until your trial ends. Cancel anytime before then.</p>
          </div>

          <div className="checkout-grid">
            <div className="card checkout-card">
              <h2 className="checkout-card-title">How it works</h2>
              <ol style={{ margin: "12px 0 20px 18px", display: "grid", gap: 10 }}>
                <li>Create your account (takes under a minute).</li>
                <li>Pick your plan on the Billing page inside the app.</li>
                <li>Complete payment on Stripe&apos;s hosted checkout — we never see your card.</li>
              </ol>
              <Link className="btn btn-primary btn-lg" href="/signup" style={{ width: "100%", textAlign: "center" }}>
                <span className="btn-label">Create my account</span>
              </Link>
              <p className="order-fine" style={{ marginTop: 12 }}>
                Already have an account? <Link href="/login">Log in</Link> and head to Billing.
              </p>
            </div>

            <aside className="card checkout-card order-card" aria-label="Order summary">
              <h2 className="checkout-card-title">Order summary</h2>
              <div className="order-line">
                <div>
                  <strong>Onboarding OS Pro</strong>
                  <span>7-day free trial, then monthly</span>
                </div>
                <span className="order-price">$297<em>/mo</em></span>
              </div>
              <ul className="price-list order-list">
                <li>Unlimited onboarding sessions</li>
                <li>Dashboard, agent logs &amp; analytics</li>
                <li>AI assistant builder with instant publish</li>
                <li>Email, ad &amp; landing copy with spintax</li>
                <li>Website builder + creative studio</li>
                <li>3 curated AI models included</li>
              </ul>
              <hr className="order-divider" />
              <div className="order-total">
                <span>Due today</span>
                <strong>$0.00</strong>
              </div>
              <p className="order-fine">Then $297.00/mo after your 7-day free trial — cancel anytime before it ends and you won&apos;t be charged.</p>
              <p className="order-fine">Website generation add-on (+$149/mo) can be enabled by our team after checkout.</p>
              <Link className="order-back" href="/">← Back to the offer</Link>
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter
        links={[
          { href: "/", label: "What's inside" },
          { href: "/terms", label: "Terms" },
          { href: "/privacy", label: "Privacy" },
        ]}
      />
    </div>
  );
}

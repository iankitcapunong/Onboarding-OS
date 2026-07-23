import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/site/BrandMark";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy · Onboarding OS",
  description: "How Onboarding OS collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="site-nav" id="siteNav">
        <div className="container nav-inner">
          <BrandMark href="/" />
        </div>
      </header>

      <main id="main">
        <article className="legal-doc">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: July 22, 2026</p>

          <p className="legal-notice">
            <strong>Draft for legal review.</strong> This is a standard SaaS privacy-policy template
            provided as a starting point, not legal advice. Have qualified counsel review it —
            including whether it needs to be adapted for GDPR, CCPA, or other regimes that apply to
            your users — before relying on it.
          </p>

          <p>This Privacy Policy explains what information Onboarding OS (&quot;we&quot;, &quot;us&quot;) collects when you use the Service, how we use it, and who we share it with.</p>

          <h2>1. Information we collect</h2>
          <ul>
            <li><strong>Account information:</strong> name, email address, and password (handled by our authentication provider — we never see or store your plaintext password).</li>
            <li><strong>Billing information:</strong> handled by our payment processor; we do not store full card numbers on our own servers.</li>
            <li><strong>Usage &amp; product data:</strong> onboarding call/session records, prompts and business-context details you provide to the onboarding agent, generated assets (text, images, video, websites), and metering data (feature usage, monthly credit consumption) used to enforce plan limits.</li>
            <li><strong>Technical data:</strong> log data such as IP address, browser/device information, and timestamps, used for security, rate limiting, and abuse prevention.</li>
          </ul>

          <h2>2. How we use your information</h2>
          <ul>
            <li>To provide, maintain, and secure the Service, including enforcing per-account rate limits and usage quotas.</li>
            <li>To process the AI-generation requests you initiate (your prompts and business context are sent to our AI sub-processors solely to fulfill your request).</li>
            <li>To bill your subscription and communicate about your account (billing, security, trial/renewal notices).</li>
            <li>To improve the Service and diagnose problems.</li>
          </ul>

          <h2>3. Sub-processors &amp; third parties</h2>
          <p>We share data with the following categories of third-party sub-processors, only as needed to operate the Service:</p>
          <ul>
            <li><strong>Supabase</strong> — authentication, database, and serverless functions.</li>
            <li><strong>AI providers</strong> (e.g. Anthropic, OpenAI, kie.ai) — process the prompts and content you submit to AI-powered features, solely to generate the output you requested.</li>
            <li><strong>Payment processor</strong> — handles billing; we do not store full payment card numbers ourselves.</li>
          </ul>
          <p>We do not sell your personal information.</p>

          <h2>4. Data retention</h2>
          <p>We retain account and usage data for as long as your account is active, and for a reasonable period afterward for legal, billing, and security purposes. You may request deletion of your account and associated data by contacting us (subject to records we&apos;re required to retain by law).</p>

          <h2>5. Security</h2>
          <p>We use industry-standard safeguards, including encrypted connections, authenticated and rate-limited access to AI/data services, and role-based access controls. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.</p>

          <h2>6. Your rights</h2>
          <p>Depending on where you&apos;re located, you may have rights to access, correct, export, or delete your personal information. Contact us at <strong>[support email]</strong> to exercise these rights.</p>

          <h2>7. Children&apos;s privacy</h2>
          <p>The Service is not directed to individuals under 16, and we do not knowingly collect personal information from them.</p>

          <h2>8. Changes to this policy</h2>
          <p>We may update this Privacy Policy from time to time. Material changes will be notified via the Service or by email.</p>

          <h2>9. Contact</h2>
          <p>Questions about this policy or your data? Contact us at <strong>[support email]</strong>.</p>

          <p>
            See also our <Link href="/terms">Terms &amp; Conditions</Link>.
          </p>
        </article>
      </main>

      <SiteFooter
        links={[
          { href: "/", label: "What's inside" },
          { href: "/terms", label: "Terms" },
          { href: "/privacy", label: "Privacy" },
        ]}
      />
    </>
  );
}

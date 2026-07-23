import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/site/BrandMark";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Terms & Conditions · Onboarding OS",
  description:
    "Terms and conditions for using Onboarding OS, including subscription, trial, refund, and acceptable-use policies.",
};

export default function TermsPage() {
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
          <h1>Terms &amp; Conditions</h1>
          <p className="legal-updated">Last updated: July 22, 2026</p>

          <p className="legal-notice">
            <strong>Draft for legal review.</strong> This document is a standard SaaS terms-of-service
            template provided as a starting point. It is not legal advice and has not been reviewed by
            a lawyer. Have qualified counsel review and adapt it — including the company name, governing
            law, and dispute-resolution details below — before relying on it.
          </p>

          <p>
            These Terms &amp; Conditions (&quot;Terms&quot;) govern access to and use of Onboarding OS
            (the &quot;Service&quot;), operated by <strong>[Company Legal Name]</strong> (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
            By creating an account, starting a trial, or using the Service, you agree to these Terms.
            If you do not agree, do not use the Service.
          </p>

          <h2>1. The Service</h2>
          <p>Onboarding OS is a client-onboarding and AI-assisted content platform, including an onboarding agent, prompt playground, asset/creative generation, and AI-generated website/funnel building. Features available to your account depend on your plan.</p>

          <h2>2. Accounts</h2>
          <p>You must provide accurate information when creating an account and are responsible for all activity under your account and for keeping your credentials confidential. Notify us immediately of any unauthorized use.</p>

          <h2>3. Subscription, trial &amp; billing</h2>
          <p>Where a plan includes a free trial, your trial begins on signup and runs for the stated trial period (currently 7 days). Unless you cancel before the trial ends, your payment method on file will automatically be charged the plan&apos;s listed subscription price, and your subscription will renew automatically on the same billing cycle until cancelled. You can cancel anytime from your account settings; cancellation takes effect at the end of the current billing period.</p>

          <h2>4. Refunds &amp; chargebacks</h2>
          <p>If you believe you were charged in error, or want to cancel and request a refund, contact us at <strong>[support email]</strong> before filing a chargeback or payment dispute with your bank or card issuer — most billing issues can be resolved directly and faster that way. Filing a chargeback for a charge you authorized under these Terms (including a trial that converted to paid because it wasn&apos;t cancelled in time) may be contested using these Terms and your account&apos;s usage records as evidence that the charge was authorized. We reserve the right to suspend or terminate access for accounts with abusive chargeback activity.</p>

          <h2>5. Acceptable use &amp; fair-use limits</h2>
          <p>You agree not to: use the Service to build or distribute unlawful, infringing, or abusive content; attempt to bypass, disable, or reverse engineer any security, rate-limiting, or usage-metering control; share account credentials to circumvent per-account usage limits; or use the Service in a way that places unreasonable load on our infrastructure or third-party AI providers. Each plan includes a monthly usage allowance and rate limits on AI-generation actions; the Service may throttle or reject requests that exceed them. We may suspend accounts that violate this section.</p>

          <h2>6. AI-generated content</h2>
          <p>Some features use AI to generate text, images, video, or website/funnel content based on your prompts. AI-generated output may be inaccurate, may resemble content generated for other users from similar prompts, and is provided without warranty of originality, accuracy, or fitness for a particular purpose. You are responsible for reviewing generated content before publishing or relying on it, including for accuracy, legal compliance, and appropriateness for your audience. As between you and us, you own the output you generate through the Service (subject to the rights of the underlying AI providers and any third-party material, such as stock imagery, incorporated into it), provided you have paid for the applicable plan and complied with these Terms.</p>

          <h2>7. Third-party services</h2>
          <p>The Service relies on third-party providers (including cloud hosting, authentication, and AI model providers) to operate. We are not responsible for outages, errors, or content moderation decisions originating from those third parties.</p>

          <h2>8. Disclaimers &amp; limitation of liability</h2>
          <p>The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or implied. To the maximum extent permitted by law, we are not liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits or data, arising from your use of the Service. Our total liability for any claim arising from these Terms or the Service is limited to the amount you paid us in the 3 months preceding the claim.</p>

          <h2>9. Indemnification</h2>
          <p>You agree to indemnify and hold us harmless from claims, damages, and expenses arising from your use of the Service, content you generate or publish, or your violation of these Terms.</p>

          <h2>10. Termination</h2>
          <p>We may suspend or terminate your access for violation of these Terms, non-payment, or abusive/fraudulent use. You may stop using the Service and cancel your subscription at any time.</p>

          <h2>11. Changes to these Terms</h2>
          <p>We may update these Terms from time to time. Material changes will be notified via the Service or by email. Continued use after changes take effect constitutes acceptance.</p>

          <h2>12. Governing law</h2>
          <p>
            These Terms are governed by the laws of <strong>[Governing State/Country]</strong>, without
            regard to conflict-of-laws principles. <em>[Insert your chosen jurisdiction and, if desired, an arbitration/dispute-resolution clause here.]</em>
          </p>

          <h2>13. Contact</h2>
          <p>Questions about these Terms? Contact us at <strong>[support email]</strong>.</p>

          <p>
            See also our <Link href="/privacy">Privacy Policy</Link>.
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

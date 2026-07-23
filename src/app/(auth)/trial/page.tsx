import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, AuthBrandIcon } from "@/components/auth/AuthShell";
import { TrialForm } from "@/components/auth/TrialForm";

export const metadata: Metadata = {
  title: "7-Day Trial · BSL 2.0",
  robots: "noindex, nofollow",
};

const trialBrand = (
  <span className="brand" aria-label="BSL 2.0">
    <AuthBrandIcon />
    <span className="brand-name" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>
      BSL <span style={{ color: "var(--primary)" }}>2.0</span>
    </span>
  </span>
);

export default function TrialPage() {
  return (
    <div className="auth-body">
      <AuthShell brand={trialBrand}>
        <Suspense>
          <TrialForm />
        </Suspense>
      </AuthShell>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCredits } from "@/hooks/useCredits";

export function CreditsLockedPage({ feature }: { feature: string }) {
  const { trialExpired, planKey } = useCredits();

  const reason = trialExpired
    ? `${feature} is locked because your 7-day free trial has ended.`
    : planKey === "pro"
      ? `${feature} is locked until your credits reset next month — or top up now from the Billing page.`
      : `${feature} is locked because you've used your trial credits.`;

  return (
    <div className="credits-locked">
      <h2>{trialExpired ? "Your free trial has ended" : "You're out of credits"}</h2>
      <p>{reason}</p>
      <Link className="btn btn-primary" href="/app/billing">
        {planKey === "pro" ? "Go to Billing" : "Upgrade to Pro"}
      </Link>
    </div>
  );
}

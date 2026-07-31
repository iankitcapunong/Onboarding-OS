"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SideNav } from "./SideNav";
import { Topbar, ROUTE_TITLES } from "./Topbar";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useCredits } from "@/hooks/useCredits";
import { CreditsExhaustedModal } from "./CreditsExhaustedModal";

/* Server-side gating only ever hid the sidebar LINK — a gated-off client
   could still type /app/brible into the address bar and use the page.
   This closes that: once the account's real features row has loaded,
   a route whose feature is off bounces to the dashboard. Waiting on
   `loaded` matters — before the fetch resolves, featureOn() answers an
   optimistic true and a redirect decision would bounce allowed users. */
function FeatureGuard({ route, children }: { route: string; children: React.ReactNode }) {
  const router = useRouter();
  const { featureOn, loaded } = useFeatureGating();
  const blocked = loaded && !featureOn(route);

  useEffect(() => {
    if (blocked) router.replace("/app/dashboard");
  }, [blocked, router]);

  if (blocked) return null;
  return <>{children}</>;
}

function PlanChip() {
  const { isAdmin } = useFeatureGating();
  const { creditsLeft, creditAllowance, planKey, trialDaysLeft, trialExpired } = useCredits();

  let label = "Pro plan";
  let detail = `${creditsLeft} of ${creditAllowance} credits left`;
  if (isAdmin) {
    label = "Admin · Unlimited";
    detail = "Full access + client controls";
  } else if (planKey !== "pro") {
    label = "Free trial";
    detail = trialExpired
      ? "Trial ended — upgrade to Pro"
      : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left · ${creditsLeft} credits`;
  }

  return (
    <div className="plan-chip">
      <span className="plan-dot" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const route = pathname.split("/")[2] || "dashboard";
  const title = ROUTE_TITLES[route] || "Dashboard";

  return (
    <>
      <a className="skip-link" href="#appMain">Skip to main content</a>

      <CreditsExhaustedModal />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <Link href="/app/dashboard" className="brand sidebar-brand" aria-label="Onboarding OS home">
          <BrandMarkIcon />
        </Link>

        <SideNav onNavigate={() => setSidebarOpen(false)} />

        <div className="sidebar-foot">
          <PlanChip />
        </div>
      </aside>

      <div className="sidebar-scrim" hidden={!sidebarOpen} onClick={() => setSidebarOpen(false)} />

      <div className="app-frame">
        <Topbar title={title} onMenuClick={() => setSidebarOpen((v) => !v)} />
        <main className="app-main" id="appMain" tabIndex={-1}>
          <FeatureGuard route={route}>{children}</FeatureGuard>
        </main>
      </div>
    </>
  );
}

// Sidebar brand mark matches BrandMark's icon+wordmark but without the
// nested <Link> (the sidebar already wraps it in one).
function BrandMarkIcon() {
  return (
    <>
      <span className="brand-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a5 5 0 0 1 5 5v1h1a3 3 0 0 1 0 6h-1v1a5 5 0 0 1-10 0v-1H6a3 3 0 0 1 0-6h1V7a5 5 0 0 1 5-5z" />
        </svg>
      </span>
      <span className="brand-name">
        Onboarding <span className="brand-ver">OS</span>
      </span>
    </>
  );
}

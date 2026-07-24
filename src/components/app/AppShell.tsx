"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SideNav } from "./SideNav";
import { Topbar, ROUTE_TITLES } from "./Topbar";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useCredits } from "@/hooks/useCredits";
import { CreditsExhaustedModal } from "./CreditsExhaustedModal";

function PlanChip() {
  const { isAdmin, planLabel } = useFeatureGating();
  const { creditsLeft, creditAllowance } = useCredits();

  return (
    <div className="plan-chip">
      <span className="plan-dot" aria-hidden="true" />
      <div>
        <strong>{isAdmin ? "Admin · Unlimited" : `${planLabel} plan`}</strong>
        <span>{isAdmin ? "Full access + client controls" : `${creditsLeft} of ${creditAllowance} credits left`}</span>
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
        <Link href="/" className="brand sidebar-brand" aria-label="Onboarding OS home">
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
          {children}
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

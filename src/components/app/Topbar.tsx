"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const ROUTE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  agent: "Onboarding flow",
  playground: "Playground",
  calls: "Call logs",
  onboarding: "Onboarding logs",
  assets: "Assets",
  social: "Social studio",
  brible: "Brible",
  creative: "Creative ads",
  images: "Image studio",
  videos: "Video studio",
  activity: "Activity",
  access: "Client access",
  settings: "Settings",
};

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Topbar({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  const { user, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = () => setDropdownOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [dropdownOpen]);

  const name = (user?.user_metadata?.name as string | undefined) || user?.email?.split("@")[0] || "";
  const email = user?.email || "";

  return (
    <header className="topbar">
      <button type="button" className="menu-btn" aria-label="Open menu" aria-expanded={false} onClick={onMenuClick}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-right">
        <span className="agent-status">
          <span className="status-dot" aria-hidden="true" /> System live
        </span>
        <div className="user-menu">
          <button
            type="button"
            className="avatar-btn"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            aria-label="Account menu"
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen((v) => !v);
            }}
          >
            <span>{name ? initialsFor(name) : "·"}</span>
          </button>
          {dropdownOpen && (
            <div className="dropdown" onClick={(e) => e.stopPropagation()}>
              <div className="dropdown-head">
                <strong>{name || "·"}</strong>
                <span>{email || "·"}</span>
              </div>
              <Link href="/app/settings" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                Settings
              </Link>
              <button type="button" className="dropdown-item danger" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export { ROUTE_TITLES };

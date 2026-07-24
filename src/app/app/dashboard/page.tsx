"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useCallCapture } from "@/hooks/useCallCapture";
import { useAssets } from "@/hooks/useAssets";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { SessionsChart } from "@/components/dashboard/SessionsChart";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { RecentSessionsTable } from "@/components/dashboard/RecentSessionsTable";
import { computeFunnel, computeRecentSessions, computeTiles, sessionsSeries } from "@/lib/dashboardStats";

export default function DashboardPage() {
  const { user } = useAuth();
  const { logs } = useCallCapture();
  const { assets } = useAssets();
  const firstName = ((user?.user_metadata?.name as string | undefined) || "there").split(" ")[0];

  const tiles = useMemo(() => computeTiles(logs, assets), [logs, assets]);
  const chartData = useMemo(() => sessionsSeries(logs), [logs]);
  const funnelStages = useMemo(() => computeFunnel(logs, assets), [logs, assets]);
  const sessionRows = useMemo(() => computeRecentSessions(logs, assets), [logs, assets]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Welcome back, {firstName} 👋</h2>
          <p className="page-sub">Here&apos;s how your onboarding flow performed in the last 30 days.</p>
        </div>
        <Link href="/app/agent" className="btn btn-primary btn-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          New session
        </Link>
      </div>

      <div className="tiles">
        {tiles.map((t) => (
          <div className="tile" key={t.label}>
            <span className="tile-label">{t.label}</span>
            <span className="tile-value">{t.value}</span>
            <span className={`tile-delta${t.up ? " up" : ""}`}>{t.delta}</span>
            <Sparkline data={t.data} />
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h3>Onboarding sessions</h3>
              <p className="panel-sub">Last 30 days</p>
            </div>
          </div>
          <SessionsChart data={chartData} />
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Session funnel</h3>
              <p className="panel-sub">All time</p>
            </div>
          </div>
          <FunnelChart stages={funnelStages} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Recent sessions</h3>
            <p className="panel-sub">Latest client onboarding activity</p>
          </div>
          <Link href="/app/agent" className="btn btn-secondary btn-sm">Open onboarding</Link>
        </div>
        <RecentSessionsTable sessions={sessionRows} />
      </div>
    </>
  );
}

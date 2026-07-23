"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { SessionsChart } from "@/components/dashboard/SessionsChart";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { RecentSessionsTable } from "@/components/dashboard/RecentSessionsTable";

const SPARK_DATA = {
  spark1: [3, 4, 4, 5, 4, 6, 5, 7, 6, 8, 7, 9],
  spark2: [78, 80, 79, 82, 81, 84, 83, 85, 84, 86, 85, 86],
  spark3: [14, 18, 16, 20, 22, 21, 25, 24, 27, 28, 30, 33],
  spark4: [40, 44, 48, 50, 55, 58, 60, 63, 66, 70, 72, 76],
};

const TILES = [
  { label: "Onboarding sessions", value: "128", delta: "▲ 18% vs last month", up: true, data: SPARK_DATA.spark1 },
  { label: "Completion rate", value: "86%", delta: "▲ 4 pts vs last month", up: true, data: SPARK_DATA.spark2 },
  { label: "Assets generated", value: "312", delta: "▲ 22% vs last month", up: true, data: SPARK_DATA.spark3 },
  { label: "Time saved", value: "768 hrs", delta: "≈ 6 hrs per session", up: false, data: SPARK_DATA.spark4 },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = ((user?.user_metadata?.name as string | undefined) || "there").split(" ")[0];

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
        {TILES.map((t) => (
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
          <SessionsChart />
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Session funnel</h3>
              <p className="panel-sub">Last 30 days</p>
            </div>
          </div>
          <FunnelChart />
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
        <RecentSessionsTable />
      </div>
    </>
  );
}

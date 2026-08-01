import type { CallLog } from "@/hooks/useCallCapture";
import type { Asset } from "@/hooks/useAssets";

/* Derives the dashboard's tiles/chart/funnel/table straight from this
   account's real call logs + generated assets (both already live React
   state from useCallCapture()/useAssets()) instead of demo constants —
   so the dashboard reflects this client's own session activity and
   updates the instant that state changes. There's no sessions/assets
   table in Postgres (see AGENTS.md's data model), so this is the
   client-side source of truth. */

const DAY_MS = 86_400_000;
const SPARK_DAYS = 12;
const CHART_DAYS = 30;
const HOURS_PER_SESSION = 4;
const HOURS_PER_ASSET = 1;

export type Tile = { label: string; value: string; delta: string; up: boolean; data: number[] };
export type FunnelStage = { label: string; value: number; color: string };
export type SessionRow = {
  key: string;
  session: string;
  status: "done" | "progress" | "dropped";
  assets: number;
  when: string;
};

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseWhen(when: string | null | undefined): number | null {
  if (!when) return null;
  const ts = Date.parse(when);
  return Number.isNaN(ts) ? null : ts;
}

function businessKey(name: string | undefined | null) {
  return (name || "").trim().toLowerCase();
}

function nonSeedAssets(assets: Asset[]) {
  return assets.filter((a) => a.source !== "seed" && typeof a.ts === "number") as (Asset & { ts: number })[];
}

function dailyCounts(timestamps: number[], days: number) {
  const today = startOfDay(Date.now());
  const buckets = new Array(days).fill(0);
  timestamps.forEach((ts) => {
    const idx = days - 1 - Math.round((today - startOfDay(ts)) / DAY_MS);
    if (idx >= 0 && idx < days) buckets[idx] += 1;
  });
  return buckets;
}

function countBefore(timestamps: number[], days: number) {
  const cutoff = startOfDay(Date.now()) - (days - 1) * DAY_MS;
  return timestamps.filter((ts) => startOfDay(ts) < cutoff).length;
}

function cumulativeFrom(buckets: number[], seed: number) {
  let running = seed;
  return buckets.map((v) => (running += v));
}

export function sessionsSeries(logs: CallLog[], days = CHART_DAYS) {
  const timestamps = logs.map((l) => parseWhen(l.when)).filter((t): t is number => t !== null);
  const buckets = dailyCounts(timestamps, days);
  const today = startOfDay(Date.now());
  return buckets.map((value, i) => ({ date: new Date(today - (days - 1 - i) * DAY_MS), value }));
}

export function computeFunnel(logs: CallLog[], assets: Asset[]): FunnelStage[] {
  const started = logs.length;
  const completed = logs.filter((l) => businessKey(l.summary?.business)).length;
  const assetKeys = new Set(nonSeedAssets(assets).map((a) => businessKey(a.session)).filter(Boolean));
  const withAssets = logs.filter((l) => {
    const key = businessKey(l.business);
    return key && assetKeys.has(key);
  }).length;
  return [
    { label: "Sessions started", value: started, color: "#86a534" },
    { label: "Interview completed", value: completed, color: "#aed13f" },
    { label: "Assets generated", value: withAssets, color: "#cdf463" },
  ];
}

export function computeRecentSessions(logs: CallLog[], assets: Asset[]): SessionRow[] {
  const real = nonSeedAssets(assets);
  return logs.map((l) => {
    const key = businessKey(l.business);
    const assetCount = key ? real.filter((a) => businessKey(a.session) === key).length : 0;
    const status: SessionRow["status"] = assetCount > 0 ? "done" : key ? "progress" : "dropped";
    return { key: l.id, session: l.business || "Untitled session", status, assets: assetCount, when: l.when };
  });
}

export function computeTiles(logs: CallLog[], assets: Asset[]): Tile[] {
  const real = nonSeedAssets(assets);
  const sessionTs = logs.map((l) => parseWhen(l.when)).filter((t): t is number => t !== null);
  const completedTs = logs
    .filter((l) => businessKey(l.summary?.business))
    .map((l) => parseWhen(l.when))
    .filter((t): t is number => t !== null);
  const assetTs = real.map((a) => a.ts);

  const sessionDaily = dailyCounts(sessionTs, SPARK_DAYS);
  const completedDaily = dailyCounts(completedTs, SPARK_DAYS);
  const assetDaily = dailyCounts(assetTs, SPARK_DAYS);

  const sessionCumulative = cumulativeFrom(sessionDaily, countBefore(sessionTs, SPARK_DAYS));
  const completedCumulative = cumulativeFrom(completedDaily, countBefore(completedTs, SPARK_DAYS));
  const assetCumulative = cumulativeFrom(assetDaily, countBefore(assetTs, SPARK_DAYS));
  const timeSavedCumulative = sessionCumulative.map((s, i) => s * HOURS_PER_SESSION + assetCumulative[i] * HOURS_PER_ASSET);
  const completionSeries = sessionCumulative.map((s, i) => (s ? Math.round((completedCumulative[i] / s) * 100) : 0));

  const totalSessions = logs.length;
  const totalCompleted = completedTs.length;
  const totalAssets = real.length;
  const totalHours = totalSessions * HOURS_PER_SESSION + totalAssets * HOURS_PER_ASSET;
  const completionRate = totalSessions ? Math.round((totalCompleted / totalSessions) * 100) : 0;

  const last30Sessions = dailyCounts(sessionTs, CHART_DAYS).reduce((a, b) => a + b, 0);
  const last30Assets = dailyCounts(assetTs, CHART_DAYS).reduce((a, b) => a + b, 0);

  return [
    {
      label: "Onboarding sessions",
      value: String(totalSessions),
      delta: totalSessions ? `${last30Sessions} in the last 30 days` : "Capture your first call to get started",
      up: last30Sessions > 0,
      data: sessionDaily,
    },
    {
      label: "Completion rate",
      value: `${completionRate}%`,
      delta: totalSessions ? `${totalCompleted} of ${totalSessions} sessions` : "No sessions yet",
      up: completionRate >= 50,
      data: completionSeries,
    },
    {
      label: "Assets generated",
      value: String(totalAssets),
      delta: totalAssets ? `${last30Assets} in the last 30 days` : "Generate your first asset",
      up: last30Assets > 0,
      data: assetCumulative,
    },
    {
      label: "Time saved",
      value: `${totalHours} hrs`,
      delta: totalSessions ? `≈ ${(totalHours / totalSessions).toFixed(1)} hrs per session` : "Starts adding up once you run sessions",
      up: totalHours > 0,
      data: timeSavedCumulative,
    },
  ];
}

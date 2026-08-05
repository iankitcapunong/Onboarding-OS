"use client";

import { useActivityLog, type ActivityEntry, type ActivityType } from "@/hooks/useActivityLog";
import { useToast } from "@/components/app/ToastProvider";

const ACT_ICONS: Record<ActivityType, React.ReactNode> = {
  call: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
  ),
  asset: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
  ),
  creative: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" /></svg>
  ),
  publish: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /></svg>
  ),
  system: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v3" /><path d="M12 20v3" /><path d="m4.2 4.2 2.1 2.1" /><path d="m17.7 17.7 2.1 2.1" /><path d="M1 12h3" /><path d="M20 12h3" /><path d="m4.2 19.8 2.1-2.1" /><path d="m17.7 6.3 2.1-2.1" /></svg>
  ),
  memory: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" /></svg>
  ),
};

function actWhen(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const yd = new Date(now);
  yd.setDate(now.getDate() - 1);
  if (d.toDateString() === yd.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${time}`;
}

function ActivityRow({ a }: { a: ActivityEntry }) {
  return (
    <li className="act-row">
      <span className={`act-ic act-${a.t}`}>{ACT_ICONS[a.t] || ACT_ICONS.system}</span>
      <span className="act-text">{a.x}</span>
      <time>{actWhen(a.ts)}</time>
    </li>
  );
}

export default function ActivityPage() {
  const { activity, clearActivity } = useActivityLog();
  const toast = useToast();

  function handleClear() {
    if (!activity.length) {
      toast("Activity is already empty");
      return;
    }
    if (!confirm("Clear the entire activity log?")) return;
    clearActivity();
    toast("Activity cleared", true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Activity</h2>
          <p className="page-sub">A record of what you do across Onboarding OS. Calls, assets and creatives.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleClear}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          Clear activity
        </button>
      </div>
      <div className="panel">
        <ul className="act-list">
          {activity.length === 0 ? (
            <li className="act-empty">
              {ACT_ICONS.system}
              <p>Nothing logged yet. Capture a call or generate an asset and it shows up here.</p>
            </li>
          ) : (
            activity.map((a) => <ActivityRow key={a.ts} a={a} />)
          )}
        </ul>
      </div>
    </>
  );
}

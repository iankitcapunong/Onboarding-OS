import type { FunnelStage } from "@/lib/dashboardStats";

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const max = stages[0]?.value || 1;
  return (
    <div id="funnel">
      {stages.map((s) => {
        const pct = Math.round((s.value / max) * 100);
        return (
          <div className="funnel-row" key={s.label}>
            <div className="funnel-label">
              <span>{s.label}</span>
              <strong>
                {s.value} · {pct}%
              </strong>
            </div>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${pct}%`, background: s.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

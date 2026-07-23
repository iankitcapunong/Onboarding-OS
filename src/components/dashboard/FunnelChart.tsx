const FUNNEL = [
  { label: "Sessions started", value: 128, color: "#3730a3" },
  { label: "Interview completed", value: 110, color: "#4f46e5" },
  { label: "Assets generated", value: 96, color: "#818cf8" },
];

export function FunnelChart() {
  const max = FUNNEL[0].value;
  return (
    <div id="funnel">
      {FUNNEL.map((s) => {
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

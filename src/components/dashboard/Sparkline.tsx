export function Sparkline({ data }: { data: number[] }) {
  const w = 120;
  const h = 32;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });

  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h - 1} L${pts[0][0].toFixed(1)} ${h - 1} Z`;
  const end = pts[pts.length - 1];

  return (
    <svg className="tile-spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill="rgba(79,70,229,0.1)" />
      <path d={line} fill="none" stroke="#4f46e5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={end[0]} cy={end[1]} r={3.2} fill="#4f46e5" stroke="#ffffff" strokeWidth={2} />
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export type SessionsChartPoint = { date: Date; value: number };

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SessionsChart({ data }: { data: SessionsChartPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 280;
  const m = { top: 16, right: 46, bottom: 30, left: 34 };
  const iw = width - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const n = data.length;
  const rawMax = Math.max(...data.map((d) => d.value), 0);
  const yMax = Math.max(10, Math.ceil((rawMax + 1) / 5) * 5);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  const x = (i: number) => m.left + (i / (n - 1)) * iw;
  const y = (v: number) => m.top + ih - (v / yMax) * ih;

  const lineD = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const areaD = `${lineD} L${x(n - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  const last = data[n - 1];

  function handleMove(e: React.MouseEvent | React.TouchEvent) {
    if (!svgRef.current || width < 80) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const px = clientX - rect.left;
    let idx = Math.round(((px - m.left) / iw) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    setHoverIdx(idx);
  }

  const hover = hoverIdx !== null ? data[hoverIdx] : null;
  const hoverX = hoverIdx !== null ? x(hoverIdx) : 0;
  const hoverY = hoverIdx !== null ? y(hover!.value) : 0;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {width >= 80 && (
        <svg
          ref={svgRef}
          id="sessionsChart"
          role="img"
          aria-label={`Line chart of onboarding sessions captured per day over the last 30 days, ending at ${last.value} session${last.value !== 1 ? "s" : ""} today.`}
          viewBox={`0 0 ${width} ${H}`}
          width={width}
          height={H}
          onMouseMove={handleMove}
          onTouchStart={handleMove}
          onTouchMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
          onTouchEnd={() => setHoverIdx(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={m.left} y1={y(t)} x2={width - m.right} y2={y(t)} stroke="rgba(236,244,214,0.08)" strokeWidth={1} />
              <text x={m.left - 9} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#808875" fontFamily="Inter, sans-serif">
                {t}
              </text>
            </g>
          ))}
          {[0, 7, 14, 21, 29].map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#808875" fontFamily="Inter, sans-serif">
              {fmtDate(data[i].date)}
            </text>
          ))}
          <line x1={m.left} y1={y(0)} x2={width - m.right} y2={y(0)} stroke="rgba(236,244,214,0.16)" strokeWidth={1} />
          <path d={areaD} fill="rgba(205,244,99,0.12)" />
          <path d={lineD} fill="none" stroke="#cdf463" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={x(n - 1)} cy={y(last.value)} r={4.5} fill="#cdf463" stroke="#0a0b08" strokeWidth={2} />
          <text x={x(n - 1) + 10} y={y(last.value) + 4} fontSize={12} fontWeight={600} fill="#f2f5ec" fontFamily="Inter, sans-serif">
            {last.value}
          </text>
          {hover && (
            <>
              <line x1={hoverX} y1={m.top} x2={hoverX} y2={m.top + ih} stroke="rgba(236,244,214,0.28)" strokeWidth={1} />
              <circle cx={hoverX} cy={hoverY} r={4.5} fill="#cdf463" stroke="#0a0b08" strokeWidth={2} />
            </>
          )}
          <rect x={m.left} y={m.top} width={iw} height={ih} fill="transparent" />
        </svg>
      )}
      {hover && (
        <div className="chart-tooltip" style={{ left: hoverX, top: hoverY }}>
          <strong>
            {hover.value} session{hover.value !== 1 ? "s" : ""}
          </strong>
          <br />
          {fmtDate(hover.date)}
        </div>
      )}
    </div>
  );
}

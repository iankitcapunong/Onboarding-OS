"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* 30 days of sessions, gentle upward trend — demo data, matching the
   original's "Demo data, no backend" dashboard. */
const VALUES = [2, 3, 2, 4, 3, 3, 5, 4, 4, 5, 6, 4, 5, 6, 5, 7, 6, 5, 7, 8, 6, 7, 8, 7, 9, 8, 7, 9, 8, 9];

function buildData() {
  const today = new Date();
  return VALUES.map((value, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (VALUES.length - 1 - i));
    return { date: d, value };
  });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SessionsChart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const data = useMemo(() => buildData(), []);

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
  const yMax = 10;
  const n = data.length;

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
          aria-label="Line chart of onboarding sessions per day over the last 30 days, trending upward from 2 to 9 sessions per day."
          viewBox={`0 0 ${width} ${H}`}
          width={width}
          height={H}
          onMouseMove={handleMove}
          onTouchStart={handleMove}
          onTouchMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
          onTouchEnd={() => setHoverIdx(null)}
        >
          {[0, 2, 4, 6, 8, 10].map((t) => (
            <g key={t}>
              <line x1={m.left} y1={y(t)} x2={width - m.right} y2={y(t)} stroke="#eef2f6" strokeWidth={1} />
              <text x={m.left - 9} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#94a3b8" fontFamily="Inter, sans-serif">
                {t}
              </text>
            </g>
          ))}
          {[0, 7, 14, 21, 29].map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#94a3b8" fontFamily="Inter, sans-serif">
              {fmtDate(data[i].date)}
            </text>
          ))}
          <line x1={m.left} y1={y(0)} x2={width - m.right} y2={y(0)} stroke="#e2e8f0" strokeWidth={1} />
          <path d={areaD} fill="rgba(79,70,229,0.1)" />
          <path d={lineD} fill="none" stroke="#4f46e5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={x(n - 1)} cy={y(last.value)} r={4.5} fill="#4f46e5" stroke="#ffffff" strokeWidth={2} />
          <text x={x(n - 1) + 10} y={y(last.value) + 4} fontSize={12} fontWeight={600} fill="#0f172a" fontFamily="Inter, sans-serif">
            {last.value}
          </text>
          {hover && (
            <>
              <line x1={hoverX} y1={m.top} x2={hoverX} y2={m.top + ih} stroke="#cbd5e1" strokeWidth={1} />
              <circle cx={hoverX} cy={hoverY} r={4.5} fill="#4f46e5" stroke="#ffffff" strokeWidth={2} />
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

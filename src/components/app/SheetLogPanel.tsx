"use client";

import { useEffect } from "react";
import { useSheetLog } from "@/hooks/useSheetLog";

export function SheetLogPanel({
  sheet,
  title,
  emptyMsg,
  unit,
}: {
  sheet: "call-log" | "onboarding-log";
  title: string;
  emptyMsg: React.ReactNode;
  unit: string;
}) {
  const { rows, loading, error, refresh } = useSheetLog(sheet);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = rows ? rows.slice(1) : [];
  const cols = rows ? rows.reduce((m, r) => Math.max(m, r.length), 0) : 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>
            {title}
            {rows && entries.length > 0 && (
              <span className="sheet-count">
                {entries.length} {unit}
                {entries.length !== 1 ? "s" : ""}
              </span>
            )}
          </h3>
          <p className="panel-sub">Synced from the Google Sheet {title.toLowerCase()}</p>
        </div>
        <button type="button" className={`btn btn-secondary btn-sm${loading ? " sheet-loading" : ""}`} onClick={refresh}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          Refresh
        </button>
      </div>

      {rows && entries.length > 0 ? (
        <div className="sheet-grid-wrap">
          <table className="sheet-grid">
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className={r === 0 ? "sheet-headrow" : undefined}>
                  <td className="sheet-rownum">{r + 1}</td>
                  {Array.from({ length: cols }).map((_, c) => (
                    <td key={c} title={row[c] || ""}>
                      {row[c] || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sheet-state">
          {loading && !rows && (
            <>
              <div className="sheet-skel" />
              <div className="sheet-skel" />
              <div className="sheet-skel" />
            </>
          )}
          {!loading && error && (
            <div className="sheet-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <span>Couldn&apos;t load the sheet ({error}). Check the connection and try Refresh.</span>
            </div>
          )}
          {!loading && !error && (
            <div className="sheet-empty">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
              <p>{emptyMsg}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSheetLog } from "@/hooks/useSheetLog";
import { useToast } from "@/components/app/ToastProvider";
import { copyTable, downloadCsv } from "@/lib/csv";

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
  const { rows, loading, error, notConfigured, refresh } = useSheetLog(sheet);
  const toast = useToast();

  function handleDownload() {
    if (!rows || rows.length === 0) return;
    downloadCsv(rows, `${sheet}-${new Date().toISOString().slice(0, 10)}.csv`);
    toast("CSV downloaded", true);
  }

  async function handleCopy() {
    if (!rows || rows.length === 0) return;
    if (await copyTable(rows)) toast("Copied to clipboard — paste straight into a spreadsheet", true);
    else toast("Couldn't copy. Try Download CSV instead");
  }

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
          <p className="panel-sub">
            {notConfigured
              ? "Connect your Google Sheet to see this log"
              : `Synced from the Google Sheet ${title.toLowerCase()}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {entries.length > 0 && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopy}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
                Copy
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownload}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                Download CSV
              </button>
            </>
          )}
          <button type="button" className={`btn btn-secondary btn-sm${loading ? " sheet-loading" : ""}`} onClick={refresh}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
            Refresh
          </button>
        </div>
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
              {notConfigured ? (
                <p>
                  This log reads your own Google Sheet.{" "}
                  <Link href="/app/integrations">Connect one on the Integrations tab</Link> and every
                  finished onboarding lands there — then it shows up here.
                </p>
              ) : (
                <p>{emptyMsg}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

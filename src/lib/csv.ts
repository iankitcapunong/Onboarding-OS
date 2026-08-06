/* Shared table-export helpers: Download CSV / copy-as-TSV, used by the
   sheet log panels and the Tools page. */

/* Cells are joined with a delimiter per row; quoting only when the cell
   contains the delimiter, quotes or newlines, so Excel/Sheets open it clean. */
export function joinRows(rows: string[][], cols: number, delim: string): string {
  const esc = (v: string) => (v.includes(delim) || /["\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((row) => Array.from({ length: cols }, (_, c) => esc(row[c] || "")).join(delim)).join("\r\n");
}

function maxCols(rows: string[][]): number {
  return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

export function downloadCsv(rows: string[][], filename: string) {
  /* BOM so Excel detects UTF-8 */
  const blob = new Blob(["\uFEFF" + joinRows(rows, maxCols(rows), ",")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* tab-separated so a paste lands in spreadsheet cells */
export async function copyTable(rows: string[][]): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(joinRows(rows, maxCols(rows), "\t"));
    return true;
  } catch {
    return false;
  }
}

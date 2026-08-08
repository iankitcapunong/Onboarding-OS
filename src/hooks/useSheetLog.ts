"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callSheetsLog } from "@/lib/edgeFunctions";

type SheetLogState = {
  rows: string[][] | null;
  loading: boolean;
  error: string | null;
  /** No Google Sheet connected yet — an empty state, not a failure. */
  notConfigured: boolean;
};

/* Direct replacement for js/app.js's SHEET LOGS section (wireSheetLog).
   Calls the "sheets-log" Edge Function — the Google Sheets API key and
   the service-account credentials live only in that function's secrets.
   The function serves the caller's OWN connected sheet; an account that
   hasn't connected one gets notConfigured instead of somebody else's
   data, so the empty state below is the normal first-run path. */
export function useSheetLog(sheet: "call-log" | "onboarding-log") {
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<SheetLogState>({ rows: null, loading: false, error: null, notConfigured: false });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await callSheetsLog<{ values?: string[][]; notConfigured?: boolean }>(supabase, sheet);
      setState({
        rows: data.values || [],
        loading: false,
        error: null,
        notConfigured: data.notConfigured === true,
      });
    } catch (err) {
      setState({
        rows: null,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load",
        notConfigured: false,
      });
    }
  }, [supabase, sheet]);

  return { ...state, refresh };
}

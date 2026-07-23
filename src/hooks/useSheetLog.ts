"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callSheetsLog } from "@/lib/edgeFunctions";

type SheetLogState = {
  rows: string[][] | null;
  loading: boolean;
  error: string | null;
};

/* Direct replacement for js/app.js's SHEET LOGS section (wireSheetLog).
   Calls the "sheets-log" Edge Function — the Google Sheets API key and
   sheet id/name live only in that function's secrets. */
export function useSheetLog(sheet: "call-log" | "onboarding-log") {
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<SheetLogState>({ rows: null, loading: false, error: null });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await callSheetsLog<{ values?: string[][] }>(supabase, sheet);
      setState({ rows: data.values || [], loading: false, error: null });
    } catch (err) {
      setState({ rows: null, loading: false, error: err instanceof Error ? err.message : "Failed to load" });
    }
  }, [supabase, sheet]);

  return { ...state, refresh };
}

import type { SupabaseClient } from "@supabase/supabase-js";

export class EdgeFunctionError extends Error {}

/* Ported 1:1 from the SB.auth.getSession() + fetch(".../functions/v1/<name>")
   pattern repeated across app.js (bribleCallFn, sheetsFn) and
   imagegen.js/videogen.js (kieFn): attach the session's access token,
   parse the JSON envelope, and throw using the same error precedence
   (detail > error > "fn-<status>"). */
async function callEdgeFunction<T = unknown>(
  supabase: SupabaseClient,
  name: "brible" | "imagegen" | "videogen" | "sheets-log",
  payload: unknown
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new EdgeFunctionError("not-signed-in");

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new EdgeFunctionError(data?.detail || data?.error || `fn-${res.status}`);
  }
  return data as T;
}

export function callSheetsLog<T = unknown>(supabase: SupabaseClient, sheet: string) {
  return callEdgeFunction<T>(supabase, "sheets-log", { sheet });
}

export function callBrible<T = { remaining?: number }>(supabase: SupabaseClient, payload: unknown) {
  return callEdgeFunction<T>(supabase, "brible", payload);
}

export function callImagegen<T = { remaining?: number }>(
  supabase: SupabaseClient,
  method: string,
  path: string,
  body?: unknown
) {
  return callEdgeFunction<T>(supabase, "imagegen", { method, path, body: body ?? null });
}

export function callVideogen<T = { remaining?: number }>(
  supabase: SupabaseClient,
  method: string,
  path: string,
  body?: unknown
) {
  return callEdgeFunction<T>(supabase, "videogen", { method, path, body: body ?? null });
}

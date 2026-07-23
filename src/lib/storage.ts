export function scopedKey(base: string, email: string) {
  return `${base}:${email.trim().toLowerCase()}`;
}

export function getJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable/full — non-fatal, matches original try/catch guards
  }
}

/* Returns the `<suffix>` part of every stored key matching `<prefix>:<suffix>`.
   Used to discover per-account scoped records (e.g. every email an admin has
   ever configured feature access for) without a server-side user registry. */
export function scanScopedSuffixes(prefix: string): string[] {
  if (typeof window === "undefined") return [];
  const out: string[] = [];
  const needle = `${prefix}:`;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(needle)) out.push(key.slice(needle.length));
    }
  } catch {
    // ignore
  }
  return out;
}

"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useActivityLog } from "./useActivityLog";
import { useToast } from "@/components/app/ToastProvider";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";

export type MemoryClient = {
  key: string;
  business: string;
  offer?: string;
  audience?: string;
  goal?: string;
  voice?: string;
  themeKey?: string;
  publishedUrl?: string;
  updated?: number;
};

type MemoryState = { clients: MemoryClient[]; activeKey: string | null };

type CapturedFields = { business?: string; offer?: string; audience?: string; goal?: string; voice?: string };

type MemoryContextValue = {
  clients: MemoryClient[];
  activeClient: MemoryClient | null;
  rememberClient: (fields: CapturedFields, quiet?: boolean) => MemoryClient | null;
  rememberPref: (business: string, key: "themeKey" | "publishedUrl", value: string) => void;
  setActiveClient: (key: string) => void;
  forgetClient: (key: string) => void;
};

const MemoryContext = createContext<MemoryContextValue | null>(null);

/* Direct replacement for js/app.js's MEMORY section — the app remembers
   clients across sessions and uses them to brief the generators when no
   fresh call exists. */
export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const toast = useToast();
  const email = (user?.email || "").toLowerCase();
  const memKey = scopedKey("bsl_memory", email);

  const [memory, setMemory] = useState<MemoryState>(() => {
    const stored = getJSON<MemoryState>(memKey);
    if (stored && Array.isArray(stored.clients)) return stored;
    return { clients: [], activeKey: null };
  });

  const activeClient = useMemo(() => {
    if (memory.activeKey) {
      const found = memory.clients.find((c) => c.key === memory.activeKey);
      if (found) return found;
    }
    return memory.clients[0] || null;
  }, [memory]);

  const rememberClient = useCallback(
    (fields: CapturedFields, quiet = false): MemoryClient | null => {
      const biz = (fields.business || "").trim();
      if (!biz) return null;
      const key = biz.toLowerCase();

      let result: MemoryClient | null = null;
      let isNew = false;

      setMemory((prev) => {
        let clients = [...prev.clients];
        let m = clients.find((c) => c.key === key);
        if (!m) {
          m = { key, business: biz };
          clients.unshift(m);
          isNew = true;
        } else {
          clients = clients.filter((c) => c.key !== key);
          clients.unshift(m);
        }
        (["offer", "audience", "goal", "voice"] as const).forEach((k) => {
          const v = (fields[k] || "").trim();
          if (v) m![k] = v;
        });
        m.business = biz;
        m.updated = Date.now();
        clients = clients.slice(0, 12);
        result = m;
        const next = { ...prev, clients };
        setJSON(memKey, next);
        return next;
      });

      if (!quiet) {
        logActivity("memory", `${isNew ? "Remembered new client: " : "Updated memory for "}${biz}`);
      }
      return result;
    },
    [memKey, logActivity]
  );

  const rememberPref = useCallback(
    (business: string, key: "themeKey" | "publishedUrl", value: string) => {
      if (!business || !value) return;
      const m = rememberClient({ business }, true);
      if (!m) return;
      const targetKey = m.key;
      setMemory((prev) => {
        const clients = prev.clients.map((c) => (c.key === targetKey ? { ...c, [key]: value } : c));
        const next = { ...prev, clients };
        setJSON(memKey, next);
        return next;
      });
    },
    [rememberClient, memKey]
  );

  const setActiveClient = useCallback(
    (key: string) => {
      setMemory((prev) => {
        const next = { ...prev, activeKey: key };
        setJSON(memKey, next);
        return next;
      });
      const m = memory.clients.find((c) => c.key === key);
      if (m) {
        logActivity("memory", `Set ${m.business} as the active brief`);
        toast(`${m.business} is now the active brief for generation`, true);
      }
    },
    [memKey, memory.clients, logActivity, toast]
  );

  const forgetClient = useCallback(
    (key: string) => {
      const m = memory.clients.find((c) => c.key === key);
      setMemory((prev) => {
        const clients = prev.clients.filter((c) => c.key !== key);
        const activeKey = prev.activeKey === key ? null : prev.activeKey;
        const next = { clients, activeKey };
        setJSON(memKey, next);
        return next;
      });
      if (m) logActivity("memory", `Forgot ${m.business}`);
    },
    [memKey, memory.clients, logActivity]
  );

  const value = useMemo(
    () => ({ clients: memory.clients, activeClient, rememberClient, rememberPref, setActiveClient, forgetClient }),
    [memory.clients, activeClient, rememberClient, rememberPref, setActiveClient, forgetClient]
  );

  return <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>;
}

export function useMemory() {
  const ctx = useContext(MemoryContext);
  if (!ctx) throw new Error("useMemory must be used within MemoryProvider");
  return ctx;
}

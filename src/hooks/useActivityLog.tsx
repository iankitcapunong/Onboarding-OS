"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";

export type ActivityType = "call" | "asset" | "creative" | "publish" | "system" | "memory";
export type ActivityEntry = { t: ActivityType; x: string; ts: number };

type ActivityContextValue = {
  activity: ActivityEntry[];
  logActivity: (type: ActivityType, text: string) => void;
  clearActivity: () => void;
};

const ActivityContext = createContext<ActivityContextValue | null>(null);

/* Direct replacement for js/app.js's ACTIVITY LOG section
   (logActivity()/window.bslLogActivity, renderActivity()'s data side). */
export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const email = (user?.email || "").toLowerCase();
  const activityKey = scopedKey("bsl_activity", email);

  const [activity, setActivity] = useState<ActivityEntry[]>(() => {
    const stored = getJSON<ActivityEntry[]>(activityKey);
    return Array.isArray(stored) ? stored : [];
  });

  const logActivity = useCallback(
    (type: ActivityType, text: string) => {
      setActivity((prev) => {
        const next = [{ t: type, x: text, ts: Date.now() }, ...prev].slice(0, 120);
        setJSON(activityKey, next);
        return next;
      });
    },
    [activityKey]
  );

  const clearActivity = useCallback(() => {
    setActivity([]);
    setJSON(activityKey, []);
  }, [activityKey]);

  const value = useMemo(() => ({ activity, logActivity, clearActivity }), [activity, logActivity, clearActivity]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivityLog() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivityLog must be used within ActivityProvider");
  return ctx;
}

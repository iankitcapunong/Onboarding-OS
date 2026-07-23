"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useActivityLog } from "./useActivityLog";
import { useCredits } from "./useCredits";
import { useMemory } from "./useMemory";
import { useToast } from "@/components/app/ToastProvider";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";
import { buildContent, type AssetType, type CapturedFields } from "@/lib/assetTemplates";
import { buildWebsiteHTML, resolveCreativeCtx } from "@/lib/creativeBuilders";

export type Asset = {
  id: string;
  type: AssetType;
  session: string;
  ts: number | null;
  when?: string;
  source: "call" | "memory" | "demo" | "seed";
  details: CapturedFields | null;
  content?: string;
  html?: string;
  theme?: string;
};

type LastCall = { summary?: CapturedFields };

const SEED_CTX: Record<string, CapturedFields> = {
  "Chen Coaching": { business: "Chen Coaching", offer: "a 1:1 executive coaching program", audience: "mid-career professionals stepping into leadership", goal: "book more discovery calls", voice: "warm, direct, encouraging" },
  "Okafor Fitness": { business: "Okafor Fitness", offer: "a 12-week personal training program", audience: "busy professionals who want to get strong", goal: "fill the next training cohort", voice: "energetic, motivating" },
};

function seedAssets(): Asset[] {
  return [
    { type: "Email copy" as const, session: "Chen Coaching", when: "Yesterday", ts: null, source: "seed" as const },
    { type: "Ad copy" as const, session: "Chen Coaching", when: "Yesterday", ts: null, source: "seed" as const },
    { type: "Landing page copy" as const, session: "Okafor Fitness", when: "Jun 29", ts: null, source: "seed" as const },
    { type: "Email copy" as const, session: "Okafor Fitness", when: "Jun 29", ts: null, source: "seed" as const },
  ].map((a, i) => ({
    ...a,
    id: `seed-${i}`,
    details: SEED_CTX[a.session] || null,
    content: buildContent(a.type, SEED_CTX[a.session] || {}),
  }));
}

type AssetsContextValue = {
  assets: Asset[];
  latestSessionName: string | null;
  generate: (types: AssetType[]) => Promise<void>;
  clearAll: () => void;
  generating: boolean;
};

const AssetsContext = createContext<AssetsContextValue | null>(null);

/* Direct replacement for js/app.js's ASSETS section. Text assets are
   generated client-side from spintax templates briefed by the latest
   call capture (or active client memory) — no LLM call, matching the
   original's "Demo data, no backend" text-generation path. The
   "Website" type builds a full HTML document via
   src/lib/creativeBuilders.ts's buildWebsiteHTML (shared with the
   Creative Ads route), matching the original's
   `buildWebsiteHTML(creativeCtx())` call. */
export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { spendCredits } = useCredits();
  const { activeClient } = useMemory();
  const toast = useToast();
  const email = (user?.email || "").toLowerCase();
  const assetsKey = scopedKey("bsl_assets", email);
  const callKey = scopedKey("bsl_last_call", email);

  const [assets, setAssets] = useState<Asset[]>(() => {
    const stored = getJSON<Asset[]>(assetsKey);
    if (Array.isArray(stored)) return stored;
    const seeded = seedAssets();
    setJSON(assetsKey, seeded);
    return seeded;
  });
  const [generating, setGenerating] = useState(false);

  const latestCallContext = useCallback((): CapturedFields | null => {
    const call = getJSON<LastCall>(callKey);
    const s = call?.summary;
    if (!s) return null;
    const hasAny = (["business", "offer", "audience", "goal", "voice"] as const).some((k) => (s[k] || "").trim());
    return hasAny ? s : null;
  }, [callKey]);

  const liveCtx = latestCallContext();
  const latestSessionName = liveCtx?.business?.trim() || null;

  const generate = useCallback(
    async (types: AssetType[]) => {
      if (!types.length) {
        toast("Select at least one asset type to generate");
        return;
      }
      if (!spendCredits("asset", types.length)) return;

      const live = latestCallContext();
      const mem = !live ? activeClient : null;
      const ctx = live || mem;
      const assetSource: Asset["source"] = live ? "call" : mem ? "memory" : "demo";
      const sessionName = ctx?.business?.trim() || "";

      let details: CapturedFields | null = null;
      if (ctx) {
        details = {};
        (["business", "offer", "audience", "goal", "voice"] as const).forEach((k) => {
          if ((ctx[k] || "").trim()) details![k] = ctx[k]!.trim();
        });
      }

      setGenerating(true);
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 100 : 1600));

      const newAssets: Asset[] = types.map((type) => {
        if (type === "Website") {
          const site = buildWebsiteHTML(resolveCreativeCtx(live, mem));
          return {
            id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type,
            session: sessionName,
            ts: Date.now(),
            source: assetSource,
            details,
            html: site.html,
            theme: site.theme,
          };
        }
        return {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type,
          session: sessionName,
          ts: Date.now(),
          source: assetSource,
          details,
          content: buildContent(type, ctx || {}),
        };
      });

      setAssets((prev) => {
        const next = [...newAssets, ...prev];
        setJSON(assetsKey, next);
        return next;
      });
      setGenerating(false);
      logActivity("asset", `Generated ${types.join(", ")}${ctx ? " from call capture" : ""}`);
      toast(`${types.length} asset${types.length > 1 ? "s" : ""} generated${ctx ? " from your call capture" : ""}`, true);
    },
    [assetsKey, activeClient, spendCredits, logActivity, toast, latestCallContext]
  );

  const clearAll = useCallback(() => {
    setAssets([]);
    setJSON(assetsKey, []);
  }, [assetsKey, setAssets]);

  const value = useMemo(
    () => ({ assets, latestSessionName, generate, clearAll, generating }),
    [assets, latestSessionName, generate, clearAll, generating]
  );

  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>;
}

export function useAssets() {
  const ctx = useContext(AssetsContext);
  if (!ctx) throw new Error("useAssets must be used within AssetsProvider");
  return ctx;
}

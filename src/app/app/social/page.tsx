"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMemory } from "@/hooks/useMemory";
import { useCredits } from "@/hooks/useCredits";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/components/app/ToastProvider";
import { CreditsLockedPage } from "@/components/app/CreditsLockedPage";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";
import { spinText, type CapturedFields } from "@/lib/assetTemplates";
import {
  SOCIAL_PLATFORMS,
  resolveSocialCtx,
  socialNextSlot,
  socialPost,
  socialWhen,
  socialFullText,
  type SocialItem,
  type SocialPlatform,
} from "@/lib/socialTemplates";
import { SocialItemRow } from "@/components/social/SocialItemRow";
import { SocialEditRow, type SocialEditSave } from "@/components/social/SocialEditRow";

/* Direct replacement for js/app.js's SOCIAL STUDIO section + app.html's
   #route-social markup (lines 429-467). State is kept page-local with
   useState rather than a shared Context/provider: nothing else in this
   codebase reads or writes social studio state, so a provider would add
   an indirection layer with no consumer. If a future route needs the
   queue (e.g. a dashboard widget), lift this into a
   useSocialStudio provider following the useAssets.tsx shape. */

type LastCall = { summary?: CapturedFields };

const DEFAULT_SELECTED: Record<SocialPlatform, boolean> = {
  Facebook: true,
  Instagram: true,
  LinkedIn: true,
  X: false,
  TikTok: false,
};

const SYSTEM_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v3" />
    <path d="M12 20v3" />
    <path d="m4.2 4.2 2.1 2.1" />
    <path d="m17.7 17.7 2.1 2.1" />
    <path d="M1 12h3" />
    <path d="M20 12h3" />
    <path d="m4.2 19.8 2.1-2.1" />
    <path d="m17.7 6.3 2.1-2.1" />
  </svg>
);

export default function SocialStudioPage() {
  const { user } = useAuth();
  const { activeClient } = useMemory();
  const { spendCredits, creditsExhausted } = useCredits();
  const { logActivity } = useActivityLog();
  const toast = useToast();

  const email = (user?.email || "").toLowerCase();
  const storageKey = scopedKey("bsl_social", email);
  const callKey = scopedKey("bsl_last_call", email);

  const [items, setItems] = useState<SocialItem[]>(() => {
    const stored = getJSON<SocialItem[]>(storageKey);
    return Array.isArray(stored) ? stored : [];
  });
  const [selected, setSelected] = useState<Record<SocialPlatform, boolean>>(DEFAULT_SELECTED);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  /* attached media previews live only for this browser session (object
     URLs can't survive reload, and dumping video data into localStorage
     would blow the quota) — item.media keeps the name/type so it still
     shows after a refresh, just without the live thumbnail. This is
     React state (not a plain ref like the original's socialMediaUrls
     object) because it drives what each row renders — the React
     Compiler forbids reading ref.current during render. */
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  // Mirrors mediaUrls into a ref purely so the unmount effect below can
  // revoke whatever's current without re-running (and re-revoking) on
  // every mediaUrls change — refs may be read/written in effects, just
  // not during render.
  const mediaUrlsRef = useRef(mediaUrls);
  useEffect(() => {
    mediaUrlsRef.current = mediaUrls;
  }, [mediaUrls]);

  useEffect(() => {
    return () => {
      Object.values(mediaUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function persist(next: SocialItem[]) {
    setItems(next);
    setJSON(storageKey, next);
  }

  function latestCallContext(): CapturedFields | null {
    const call = getJSON<LastCall>(callKey);
    const s = call?.summary;
    if (!s) return null;
    const hasAny = (["business", "offer", "audience", "goal", "voice"] as const).some((k) => (s[k] || "").trim());
    return hasAny ? s : null;
  }

  function buildCtx() {
    const raw = latestCallContext() || activeClient || {};
    return resolveSocialCtx(raw);
  }

  function togglePlatform(p: SocialPlatform) {
    setSelected((prev) => ({ ...prev, [p]: !prev[p] }));
  }

  async function handleGenerate() {
    const picked = SOCIAL_PLATFORMS.filter((p) => selected[p]);
    if (!picked.length) {
      toast("Pick at least one platform");
      return;
    }
    if (!spendCredits("social", picked.length)) return;

    setGenerating(true);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 100 : 1400));

    const c = buildCtx();
    const newItems: SocialItem[] = picked.map((p) => {
      const post = socialPost(p, c);
      return {
        id: "sp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        platform: p,
        session: c.fromCall ? c.business : "",
        ts: Date.now(),
        caption: post.caption,
        hashtags: post.hashtags,
        media: null,
        scheduled: null,
      };
    });

    persist([...newItems, ...items]);
    setGenerating(false);
    logActivity("asset", `Generated ${picked.length} social post${picked.length > 1 ? "s" : ""} (${picked.join(", ")})`);
    toast(`${picked.length} post${picked.length > 1 ? "s" : ""} written from your onboarding brief`, true);
  }

  function handleCopy(item: SocialItem) {
    const text = spinText(socialFullText(item));
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    toast(`${item.platform} post copied`, true);
  }

  function handleToggleSchedule(item: SocialItem) {
    if (item.scheduled) {
      persist(items.map((p) => (p.id === item.id ? { ...p, scheduled: null } : p)));
      logActivity("system", `Unscheduled a ${item.platform} post`);
    } else {
      const slot = socialNextSlot(items);
      persist(items.map((p) => (p.id === item.id ? { ...p, scheduled: slot } : p)));
      logActivity("system", `Queued a ${item.platform} post for ${socialWhen(slot)}`);
      toast(`${item.platform} post queued for ${socialWhen(slot)}`, true);
    }
  }

  function handleDelete(item: SocialItem) {
    persist(items.filter((p) => p.id !== item.id));
    const url = mediaUrls[item.id];
    if (url) {
      URL.revokeObjectURL(url);
      setMediaUrls((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  }

  function handleSaveEdit(item: SocialItem, payload: SocialEditSave) {
    if (payload.newObjectUrl) {
      const old = mediaUrls[item.id];
      if (old) URL.revokeObjectURL(old);
      const newUrl = payload.newObjectUrl;
      setMediaUrls((prev) => ({ ...prev, [item.id]: newUrl }));
    } else if (payload.removed) {
      const old = mediaUrls[item.id];
      if (old) {
        URL.revokeObjectURL(old);
        setMediaUrls((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
    }
    persist(items.map((p) => (p.id === item.id ? { ...p, caption: payload.caption, hashtags: payload.hashtags, media: payload.media } : p)));
    setEditingId(null);
    toast(`${item.platform} post updated`, true);
  }

  function handleClearAll() {
    if (!items.length) {
      toast("Nothing to clear. The studio is already empty");
      return;
    }
    Object.values(mediaUrls).forEach((url) => URL.revokeObjectURL(url));
    setMediaUrls({});
    setEditingId(null);
    persist([]);
    toast("Social studio cleared", true);
  }

  const queued = items.filter((p) => p.scheduled).sort((a, b) => (a.scheduled! < b.scheduled! ? -1 : 1));
  const drafts = items.filter((p) => !p.scheduled);

  if (creditsExhausted) return <CreditsLockedPage feature="Social studio" />;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Social studio</h2>
          <p className="page-sub">Turn every onboarding into a week of social content. Pick platforms, generate posts from the captured brief, then queue them for publishing.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Generate from latest session</h3>
            <p className="panel-sub">Posts are written from your latest call capture or active client memory · 2 credits per post</p>
          </div>
        </div>
        <div className="feat-grid">
          {SOCIAL_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={`feat-toggle${selected[p] ? " on" : ""}`}
              aria-pressed={selected[p]}
              onClick={() => togglePlatform(p)}
            >
              <span className="feat-dot" aria-hidden="true" />
              <span>{p}</span>
            </button>
          ))}
        </div>
        <div className="social-genrow">
          <button type="button" className="btn btn-primary" disabled={generating} onClick={handleGenerate}>
            <span className="btn-label">{generating ? "Writing posts…" : "Generate posts"}</span>
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Scheduled queue</h3>
            <p className="panel-sub">Simulated for now — posts publish to your connected social accounts once the backend lands</p>
          </div>
        </div>
        <ul className="social-list">
          {queued.length === 0 ? (
            <li className="act-empty">
              {SYSTEM_ICON}
              <p>Nothing queued. Generate posts below and hit Schedule — the studio spreads them across 9:00 and 18:00 slots.</p>
            </li>
          ) : (
            queued.map((item) =>
              editingId === item.id ? (
                <SocialEditRow key={item.id} item={item} existingUrl={mediaUrls[item.id]} onCancel={() => setEditingId(null)} onSave={handleSaveEdit} />
              ) : (
                <SocialItemRow
                  key={item.id}
                  item={item}
                  inQueue
                  mediaUrl={mediaUrls[item.id]}
                  onEdit={(it) => setEditingId(it.id)}
                  onCopy={handleCopy}
                  onToggleSchedule={handleToggleSchedule}
                  onDelete={handleDelete}
                />
              )
            )
          )}
        </ul>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Drafts</h3>
            <p className="panel-sub">Edit the caption, hashtags or attach an image/video, copy a post to publish it manually, or schedule it into the queue</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleClearAll}>
            Clear all
          </button>
        </div>
        <ul className="social-list">
          {drafts.length === 0 ? (
            <li className="act-empty">
              {SYSTEM_ICON}
              <p>No drafts yet. Pick platforms above and generate posts from your latest onboarding.</p>
            </li>
          ) : (
            drafts.map((item) =>
              editingId === item.id ? (
                <SocialEditRow key={item.id} item={item} existingUrl={mediaUrls[item.id]} onCancel={() => setEditingId(null)} onSave={handleSaveEdit} />
              ) : (
                <SocialItemRow
                  key={item.id}
                  item={item}
                  inQueue={false}
                  mediaUrl={mediaUrls[item.id]}
                  onEdit={(it) => setEditingId(it.id)}
                  onCopy={handleCopy}
                  onToggleSchedule={handleToggleSchedule}
                  onDelete={handleDelete}
                />
              )
            )
          )}
        </ul>
      </div>
    </>
  );
}

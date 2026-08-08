"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { EdgeFunctionError } from "@/lib/edgeFunctions";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";
import { CreditsLockedPage } from "@/components/app/CreditsLockedPage";
import { MODELS, modelCreditCost, type VideoModel } from "@/components/videos/models";
import { POLL_MS, POLL_TIMEOUT_MS, createTask, checkTask, type VideoItem, type CheckResult } from "@/components/videos/api";
import { GalleryCard } from "@/components/videos/GalleryCard";
import { Lightbox } from "@/components/videos/Lightbox";

type Sel = {
  model: VideoModel;
  ratio: string | null;
  res: string | null;
  dur: string | null;
  audio: boolean;
};

function deriveSel(m: VideoModel, prev: { ratio: string | null; res: string | null; dur: string | null }): Sel {
  let ratio = prev.ratio;
  if (m.ratios) {
    if (!ratio || !m.ratios.includes(ratio)) {
      ratio = m.ratios.includes("16:9") ? "16:9" : m.ratios[0];
    }
  }

  let res: string | null = prev.res;
  if (!m.res) {
    res = null;
  } else if (!res || !m.res.includes(res)) {
    res = m.res.includes("720p") ? "720p" : m.res[0];
  }

  let dur: string | null = prev.dur;
  if (!m.durs) {
    dur = null;
  } else {
    const durs = m.durs.map(String);
    if (!dur || !durs.includes(dur)) dur = durs[0];
  }

  return { model: m, ratio, res, dur, audio: !!m.audioDefault };
}

function ratioBoxStyle(r: string): React.CSSProperties {
  const [wStr, hStr] = r.split(":");
  const w = parseFloat(wStr);
  const h = parseFloat(hStr);
  const scale = 16 / Math.max(w, h);
  return { width: Math.max(5, Math.round(w * scale)), height: Math.max(5, Math.round(h * scale)) };
}

export default function VideoStudioPage() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { spendCredits, syncCreditsFromServer, aiLocked } = useCredits();
  const toast = useToast();
  const [supabase] = useState(() => createClient());

  const storeKey = scopedKey("bsl_videos", user?.email || "guest");

  const [sel, setSel] = useState<Sel>(() => deriveSel(MODELS[0], { ratio: "16:9", res: null, dur: null }));
  const [promptText, setPromptText] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<VideoItem | null>(null);

  const [items, setItems] = useState<VideoItem[]>(() => {
    const stored = getJSON<VideoItem[]>(storeKey);
    return Array.isArray(stored) ? stored : [];
  });

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);

  const persist = useCallback(
    (next: VideoItem[]) => {
      setJSON(storeKey, next.slice(0, 40));
    },
    [storeKey]
  );

  const finish = useCallback(
    (item: VideoItem, res: CheckResult) => {
      clearTimeout(timersRef.current[item.id]);
      delete timersRef.current[item.id];

      let err = res.err;
      if (err && item.api === "veo" && /internal error/i.test(err)) {
        err +=
          ' — Veo often rejects prompts with copyrighted characters (e.g. superheroes), celebrities or brands. Try rephrasing, e.g. "a masked hero in a red and blue suit".';
      }

      setItems((prev) => {
        const next = prev.map((it) => {
          if (it.id !== item.id) return it;
          if (err) return { ...it, state: "fail" as const, err };
          return { ...it, state: "success" as const, urls: res.urls || [], credits: res.credits ?? it.credits };
        });
        persist(next);
        return next;
      });

      if (err) {
        toast(`${item.modelName}: ${err}`);
      } else {
        toast(`Video ready · ${item.modelName}`, true);
        logActivity("creative", `Generated a video with ${item.modelName}`);
      }
    },
    [persist, toast, logActivity]
  );

  const startPolling = useCallback(
    (item: VideoItem) => {
      if (timersRef.current[item.id]) return;
      const tick = () => {
        checkTask(supabase, item)
          .then((res) => {
            if (res.done) {
              finish(item, res);
              return;
            }
            if (Date.now() - item.ts > POLL_TIMEOUT_MS) {
              finish(item, { done: true, err: "Timed out. The task may still complete on kie.ai" });
              return;
            }
            timersRef.current[item.id] = setTimeout(tick, POLL_MS);
          })
          .catch(() => {
            if (Date.now() - item.ts > POLL_TIMEOUT_MS) {
              finish(item, { done: true, err: "Lost connection while waiting for the result" });
              return;
            }
            timersRef.current[item.id] = setTimeout(tick, POLL_MS + 3000);
          });
      };
      timersRef.current[item.id] = setTimeout(tick, POLL_MS);
    },
    [supabase, finish]
  );

  // Resume polling for tasks that were still generating on last visit —
  // runs once against whatever was loaded from storage at mount.
  useEffect(() => {
    items.forEach((item) => {
      if (item.state === "generating" && item.taskId) startPolling(item);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any in-flight poll timers when this route unmounts.
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((t) => clearTimeout(t));
      timersRef.current = {};
    };
  }, []);

  function selectModel(m: VideoModel) {
    setSel((prev) => deriveSel(m, { ratio: prev.ratio, res: prev.res, dur: prev.dur }));
  }

  async function downloadVideo(item: VideoItem) {
    const url = item.urls[0];
    const name = `bsl-${item.modelId}-${item.id}.mp4`;
    toast("Downloading video…", true);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("fetch failed");
      const b = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1500);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }

  async function copyUrl(item: VideoItem) {
    try {
      await navigator.clipboard.writeText(item.urls[0]);
      toast("Video URL copied", true);
    } catch {
      toast("Could not copy the URL");
    }
  }

  function removeItem(id: string) {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      persist(next);
      return next;
    });
  }

  function handleClearAll() {
    if (!items.length) {
      toast("Nothing to clear");
      return;
    }
    if (!confirm("Remove all generations from this gallery? Videos already downloaded are not affected.")) return;
    Object.keys(timersRef.current).forEach((k) => {
      clearTimeout(timersRef.current[k]);
      delete timersRef.current[k];
    });
    setItems([]);
    persist([]);
    toast("Gallery cleared", true);
  }

  async function handleGenerate() {
    const prompt = promptText.trim();
    const m = sel.model;
    const ref = refUrl.trim();

    if (!prompt) {
      toast("Describe the video you want first");
      promptRef.current?.focus();
      return;
    }
    if (m.needsRef && !ref) {
      toast(`${m.name} needs a source image URL`);
      refInputRef.current?.focus();
      return;
    }
    if (ref && !/^https?:\/\//i.test(ref)) {
      toast("The source image must be a public http(s) URL");
      refInputRef.current?.focus();
      return;
    }

    // Premium models (Veo 3.1) cost several times a standard render, so
    // the price comes from the model, not the flat "videos" kind — the
    // videogen Edge Function charges the same way off the model it proxies.
    if (!spendCredits("videos", 1, modelCreditCost(m))) return;

    const params = {
      prompt,
      ratio: m.ratios ? sel.ratio : null,
      res: m.res ? sel.res : null,
      dur: m.durs ? sel.dur : null,
      audio: sel.audio,
      ref: (m.needsRef || m.allowsRef) && ref ? ref : null,
    };

    setBusy(true);
    try {
      const taskId = await createTask(supabase, m, params, syncCreditsFromServer);
      const item: VideoItem = {
        id: "vid" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        taskId,
        api: m.api,
        modelId: m.id,
        modelName: m.name,
        prompt,
        ratio: params.ratio,
        res: params.res,
        dur: params.dur,
        state: "generating",
        urls: [],
        ts: Date.now(),
      };
      setItems((prev) => {
        const next = [item, ...prev];
        persist(next);
        return next;
      });
      startPolling(item);
      toast(`Video generation started · ${m.name}. This can take a few minutes.`, true);
    } catch (err) {
      if (err instanceof EdgeFunctionError && err.code === "out_of_credits") syncCreditsFromServer(err.remaining ?? 0);
      toast(err instanceof Error ? err.message : "Could not reach the video service");
    } finally {
      setBusy(false);
    }
  }

  const m = sel.model;
  const showRefField = !!(m.needsRef || m.allowsRef);

  if (aiLocked) return <CreditsLockedPage feature="Video studio" />;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>AI video studio</h2>
          <p className="page-sub">Generate videos with Veo, Kling, Wan, Seedance and more. Pick a model, write a prompt, choose the format.</p>
        </div>
      </div>

      <div className="ig-layout">
        {/* Controls */}
        <div className="panel ig-controls">
          <h3 className="ig-step"><span className="ig-step-n">1</span> Choose a model</h3>
          <div className="ig-models" role="radiogroup" aria-label="Video model">
            {MODELS.map((model) => (
              <button
                key={model.id}
                type="button"
                className={"ig-model" + (model.id === m.id ? " active" : "")}
                role="radio"
                aria-checked={model.id === m.id}
                onClick={() => selectModel(model)}
              >
                <strong>
                  {model.name}
                  {model.tag ? <span className="ig-tag">{model.tag}</span> : null}
                </strong>
                <span className="ig-vendor">
                  {model.vendor} · <span className="ig-cost">{modelCreditCost(model)} credits</span>
                </span>
              </button>
            ))}
          </div>

          <h3 className="ig-step"><span className="ig-step-n">2</span> Describe your video</h3>
          <div className="field">
            <label className="sr-only" htmlFor="vgPrompt">Prompt</label>
            <textarea
              ref={promptRef}
              className="input ig-prompt"
              id="vgPrompt"
              rows={5}
              maxLength={5000}
              placeholder="A drone shot flying over a tropical coastline at sunrise, waves rolling in, cinematic color grade…"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
            />
            <p className="hint ig-count"><span>{promptText.length}</span> / 5000</p>
          </div>
          {showRefField && (
            <div className="field">
              <label htmlFor="vgRefUrl">
                Source image URL {m.needsRef && <span className="ig-req">required</span>}
              </label>
              <input
                ref={refInputRef}
                className="input"
                id="vgRefUrl"
                type="url"
                placeholder="https://…/photo.jpg"
                autoComplete="off"
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
              />
              <p className="hint">
                {m.needsRef
                  ? "This model animates an existing image. Paste a public image URL."
                  : "Optional. Add an image URL to animate it, or leave empty for text-to-video."}
              </p>
            </div>
          )}

          <h3 className="ig-step"><span className="ig-step-n">3</span> Format</h3>
          {m.ratios && (
            <div className="ig-group">
              <span className="ig-label">Aspect ratio</span>
              <div className="ig-pills" role="radiogroup" aria-label="Aspect ratio">
                {m.ratios.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={"ig-pill" + (r === sel.ratio ? " active" : "")}
                    role="radio"
                    aria-checked={r === sel.ratio}
                    onClick={() => setSel((prev) => ({ ...prev, ratio: r }))}
                  >
                    <span className="ig-ratio-box" style={ratioBoxStyle(r)} />
                    <span>{r}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {m.res && (
            <div className="ig-group">
              <span className="ig-label">Resolution</span>
              <div className="ig-pills" role="radiogroup" aria-label="Resolution">
                {m.res.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={"ig-pill" + (r === sel.res ? " active" : "")}
                    role="radio"
                    aria-checked={r === sel.res}
                    onClick={() => setSel((prev) => ({ ...prev, res: r }))}
                  >
                    <span>{r}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {m.durs && (
            <div className="ig-group">
              <span className="ig-label">Duration</span>
              <div className="ig-pills" role="radiogroup" aria-label="Duration">
                {m.durs.map(String).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={"ig-pill" + (d === sel.dur ? " active" : "")}
                    role="radio"
                    aria-checked={d === sel.dur}
                    onClick={() => setSel((prev) => ({ ...prev, dur: d }))}
                  >
                    <span>{d}s</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {m.audioKey && (
            <label className="ig-check">
              <input
                type="checkbox"
                checked={sel.audio}
                onChange={(e) => setSel((prev) => ({ ...prev, audio: e.target.checked }))}
              />
              <span>Generate audio / sound</span>
            </label>
          )}

          <button type="button" className="btn btn-primary ig-generate" onClick={handleGenerate} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
            <span className="btn-label">
              {busy ? "Starting…" : `Generate video · ${modelCreditCost(m)} credits`}
            </span>
          </button>
          <p className="hint ig-foot">Videos can take 1–10 minutes · Powered by kie.ai</p>
        </div>

        {/* Results */}
        <div className="panel ig-results">
          <div className="panel-head">
            <div>
              <h3>Generations</h3>
              <p className="panel-sub">Hosted links expire — download anything you want to keep.</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleClearAll}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Clear all
            </button>
          </div>
          <div className="ig-gallery" aria-live="polite">
            {items.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                onView={setLightboxItem}
                onDownload={downloadVideo}
                onCopy={copyUrl}
                onRemove={removeItem}
              />
            ))}
          </div>
          <div className="ig-empty" hidden={items.length > 0}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
            <p>Your generated videos appear here.<br />Pick a model, describe your video and hit Generate.</p>
          </div>
        </div>
      </div>

      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} onDownload={downloadVideo} />
      )}
    </>
  );
}

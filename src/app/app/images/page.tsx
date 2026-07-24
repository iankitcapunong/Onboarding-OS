"use client";

/* BSL 2.0 — Image studio. kie.ai-powered image generation:
   model picker, prompt, aspect ratio + resolution, async polling gallery.
   Ported 1:1 from js/imagegen.js — same MODELS data, same createTask/checkTask
   branching, same 3.5s / 8min polling, same localStorage-scoped gallery. */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callImagegen, EdgeFunctionError } from "@/lib/edgeFunctions";
import { CreditsLockedPage } from "@/components/app/CreditsLockedPage";
import { getJSON, scopedKey, setJSON } from "@/lib/storage";

/* ============================================================
   CONFIG
   ============================================================ */
const POLL_MS = 3500;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

/* ============================================================
   MODELS — unified over kie.ai Jobs API + two legacy endpoints
   ============================================================ */
const RES3 = ["1K", "2K", "4K"];
const RES2 = ["1K", "2K"];

/* ratio → fal-style image_size used by Seedream 4.0 / Ideogram / Qwen */
const SIZE_MAP: Record<string, string> = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
  "3:2": "landscape_3_2",
  "2:3": "portrait_3_2",
  "21:9": "landscape_21_9",
};
function sizeOf(ratio: string) {
  return SIZE_MAP[ratio] || "square_hd";
}

type GenParams = { prompt: string; ratio: string; res: string | null; ref: string | null };

interface ModelDef {
  id: string;
  name: string;
  vendor: string;
  tag?: string;
  api: "jobs" | "gpt4o" | "kontext";
  model?: string;
  ratios: string[];
  res: string[] | null;
  resFor?: (ratio: string) => string[];
  needsRef?: boolean;
  allowsRef?: boolean;
  input?: (p: GenParams) => Record<string, unknown>;
}

const MODELS: ModelDef[] = [
  {
    id: "gpt-image-2", name: "GPT Image 2", vendor: "OpenAI", tag: "New",
    api: "jobs", model: "gpt-image-2-text-to-image",
    ratios: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"],
    res: RES3,
    resFor: (r) => (r === "auto" ? ["1K"] : r === "1:1" ? RES2 : RES3),
    input: (p) => {
      const i: Record<string, unknown> = { prompt: p.prompt, aspect_ratio: p.ratio };
      if (p.res && p.ratio !== "auto") i.resolution = p.res;
      return i;
    },
  },
  {
    id: "nano-banana-pro", name: "Nano Banana Pro", vendor: "Google", tag: "4K",
    api: "jobs", model: "nano-banana-pro", allowsRef: true,
    ratios: ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "21:9", "auto"],
    res: RES3,
    input: (p) => {
      const i: Record<string, unknown> = { prompt: p.prompt, aspect_ratio: p.ratio, resolution: p.res || "1K", output_format: "png" };
      if (p.ref) i.image_input = [p.ref];
      return i;
    },
  },
  {
    id: "seedream-45", name: "Seedream 4.5", vendor: "ByteDance", tag: "4K",
    api: "jobs", model: "seedream/4.5-text-to-image",
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],
    res: ["2K", "4K"],
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, quality: p.res === "4K" ? "high" : "basic" }),
  },
  {
    id: "flux-2", name: "Flux 2 Pro", vendor: "Black Forest Labs",
    api: "jobs", model: "flux-2/pro-text-to-image",
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    res: RES2,
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, resolution: p.res || "1K" }),
  },
  {
    id: "nano-banana", name: "Nano Banana", vendor: "Google",
    api: "jobs", model: "google/nano-banana",
    ratios: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "auto"],
    res: null,
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, output_format: "png" }),
  },
  {
    id: "seedream-4", name: "Seedream 4.0", vendor: "ByteDance",
    api: "jobs", model: "bytedance/seedream-v4-text-to-image",
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],
    res: RES3,
    input: (p) => ({ prompt: p.prompt, image_size: sizeOf(p.ratio), image_resolution: p.res || "1K", max_images: 1 }),
  },
  {
    id: "gpt4o", name: "4o Image", vendor: "OpenAI",
    api: "gpt4o",
    ratios: ["1:1", "3:2", "2:3"],
    res: null,
  },
  {
    id: "kontext", name: "Flux.1 Kontext", vendor: "Black Forest Labs", tag: "Edit",
    api: "kontext", allowsRef: true,
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"],
    res: null,
  },
  {
    id: "imagen4", name: "Imagen 4", vendor: "Google",
    api: "jobs", model: "google/imagen4",
    ratios: ["1:1", "16:9", "9:16", "3:4", "4:3"],
    res: null,
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio }),
  },
  {
    id: "ideogram-v3", name: "Ideogram V3", vendor: "Ideogram", tag: "Text",
    api: "jobs", model: "ideogram/v3-text-to-image",
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    res: null,
    input: (p) => ({ prompt: p.prompt, image_size: sizeOf(p.ratio), rendering_speed: "BALANCED", style: "AUTO", expand_prompt: true }),
  },
  {
    id: "ideogram-char", name: "Ideogram Character", vendor: "Ideogram", tag: "Ref image",
    api: "jobs", model: "ideogram/character", needsRef: true,
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    res: null,
    input: (p) => ({
      prompt: p.prompt, reference_image_urls: [p.ref], image_size: sizeOf(p.ratio),
      rendering_speed: "BALANCED", style: "AUTO", expand_prompt: true, num_images: "1",
    }),
  },
  {
    id: "qwen-edit", name: "Qwen Image Edit", vendor: "Alibaba", tag: "Edit",
    api: "jobs", model: "qwen/image-edit", needsRef: true,
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    res: null,
    input: (p) => ({ prompt: p.prompt, image_url: p.ref, image_size: sizeOf(p.ratio), output_format: "png" }),
  },
  {
    id: "z-image", name: "Z-Image", vendor: "Tongyi", tag: "Fast",
    api: "jobs", model: "z-image",
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    res: null,
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio }),
  },
  {
    id: "nano-banana-2", name: "Nano Banana 2", vendor: "Google", tag: "New",
    api: "jobs", model: "nano-banana-2", allowsRef: true,
    ratios: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "21:9"],
    res: RES3,
    input: (p) => {
      const i: Record<string, unknown> = { prompt: p.prompt, aspect_ratio: p.ratio, resolution: p.res || "1K", output_format: "png" };
      if (p.ref) i.image_input = [p.ref];
      return i;
    },
  },
];

function modelById(id: string): ModelDef {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}

function resOptionsFor(m: ModelDef, ratio: string): string[] | null {
  if (!m.res) return null;
  return m.resFor ? m.resFor(ratio) : m.res;
}

/* ============================================================
   GALLERY ITEM
   ============================================================ */
type ItemState = "generating" | "success" | "fail";

interface GalleryItem {
  id: string;
  taskId: string;
  api: ModelDef["api"];
  modelId: string;
  modelName: string;
  prompt: string;
  ratio: string;
  res: string | null;
  state: ItemState;
  urls: string[];
  ts: number;
  err?: string;
  credits?: number;
}

type CheckResult =
  | { done: false }
  | { done: true; err?: string; urls?: string[]; credits?: number };

/* ============================================================
   API — create + poll
   ============================================================ */
interface KieEnvelope {
  code?: number;
  msg?: string;
  data?: Record<string, unknown>;
  _bslRemaining?: number;
}

type Supa = ReturnType<typeof createClient>;

async function createTask(
  supabase: Supa,
  m: ModelDef,
  p: GenParams,
  syncCreditsFromServer: (remaining: number) => void
): Promise<string> {
  let path: string;
  let body: Record<string, unknown>;

  if (m.api === "gpt4o") {
    path = "/api/v1/gpt4o-image/generate";
    body = { prompt: p.prompt, size: p.ratio, nVariants: 1 };
    if (p.ref) body.filesUrl = [p.ref];
  } else if (m.api === "kontext") {
    path = "/api/v1/flux/kontext/generate";
    body = { prompt: p.prompt, aspectRatio: p.ratio, model: "flux-kontext-pro", outputFormat: "png" };
    if (p.ref) body.inputImage = p.ref;
  } else {
    path = "/api/v1/jobs/createTask";
    body = { model: m.model, input: m.input ? m.input(p) : {} };
  }

  const j = await callImagegen<KieEnvelope>(supabase, "POST", path, body);
  if (j && typeof j._bslRemaining === "number") syncCreditsFromServer(j._bslRemaining);
  const taskId = j?.data?.taskId as string | undefined;
  if (!j || j.code !== 200 || !taskId) {
    throw new Error((j && j.msg) || "The image service rejected the request");
  }
  return taskId;
}

async function checkTask(supabase: Supa, item: GalleryItem): Promise<CheckResult> {
  let path: string;
  if (item.api === "gpt4o") path = `/api/v1/gpt4o-image/record-info?taskId=${encodeURIComponent(item.taskId)}`;
  else if (item.api === "kontext") path = `/api/v1/flux/kontext/record-info?taskId=${encodeURIComponent(item.taskId)}`;
  else path = `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(item.taskId)}`;

  const j = await callImagegen<KieEnvelope>(supabase, "GET", path);
  if (!j || j.code !== 200) return { done: true, err: (j && j.msg) || "Status check failed" };
  const d = j.data || {};

  if (item.api === "gpt4o") {
    const status = d.status as string | undefined;
    if (status === "SUCCESS") {
      const response = (d.response || {}) as Record<string, unknown>;
      const u = ((response.resultUrls || response.result_urls || []) as string[]) || [];
      return u.length ? { done: true, urls: u } : { done: true, err: "No image returned" };
    }
    if (status === "CREATE_TASK_FAILED" || status === "GENERATE_FAILED") {
      return { done: true, err: (d.errorMessage as string) || "Generation failed" };
    }
    return { done: false };
  }

  if (item.api === "kontext") {
    const successFlag = d.successFlag as number | undefined;
    if (successFlag === 1) {
      const response = (d.response || {}) as Record<string, unknown>;
      const u2 = response.resultImageUrl as string | undefined;
      return u2 ? { done: true, urls: [u2] } : { done: true, err: "No image returned" };
    }
    if (successFlag === 2 || successFlag === 3) {
      return { done: true, err: (d.errorMessage as string) || "Generation failed" };
    }
    return { done: false };
  }

  /* unified jobs API */
  if (d.state === "success") {
    let rj: Record<string, unknown> = {};
    try {
      rj = JSON.parse((d.resultJson as string) || "{}");
    } catch {
      rj = {};
    }
    const nested = (rj.result || {}) as Record<string, unknown>;
    const u3 = ((rj.resultUrls || nested.resultUrls || []) as string[]) || [];
    if (!u3.length) return { done: true, err: "No image returned" };
    return { done: true, urls: u3, credits: d.creditsConsumed as number | undefined };
  }
  if (d.state === "fail") return { done: true, err: (d.failMsg as string) || "Generation failed" };
  return { done: false };
}

/* ============================================================
   HELPERS — download, ratio display
   ============================================================ */
function downloadImage(item: GalleryItem) {
  const url = item.urls[0];
  const name = `bsl-${item.modelId}-${item.id}${url.indexOf(".jpg") > -1 || url.indexOf("jpeg") > -1 ? ".jpg" : ".png"}`;
  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error("fetch failed");
      return r.blob();
    })
    .then((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 800);
    })
    .catch(() => {
      window.open(url, "_blank", "noopener");
    });
}

function ratioBoxStyle(r: string): CSSProperties | null {
  if (r === "auto") return null;
  const parts = r.split(":");
  const w = parseFloat(parts[0]);
  const h = parseFloat(parts[1]);
  const scale = 16 / Math.max(w, h);
  return { width: Math.max(5, Math.round(w * scale)), height: Math.max(5, Math.round(h * scale)) };
}

function ratioCss(r: string | null): string {
  if (!r || r === "auto") return "1 / 1";
  return r.replace(":", " / ");
}

/* ============================================================
   GALLERY CARD
   ============================================================ */
function GalleryCard({
  item,
  now,
  onView,
  onDownload,
  onCopy,
  onDelete,
}: {
  item: GalleryItem;
  now: number;
  onView: (item: GalleryItem) => void;
  onDownload: (item: GalleryItem) => void;
  onCopy: (item: GalleryItem) => void;
  onDelete: (item: GalleryItem) => void;
}) {
  const meta = (
    <div className="ig-card-meta">
      <strong>{item.modelName}</strong>
      <span className="ig-card-prompt" title={item.prompt}>
        {item.prompt}
      </span>
      <span className="ig-card-sub">
        {item.ratio === "auto" ? "Auto" : item.ratio}
        {item.res ? ` · ${item.res}` : ""}
        {item.credits ? ` · ${item.credits} credits` : ""}
      </span>
    </div>
  );

  if (item.state === "generating") {
    const elapsed = Math.round((now - item.ts) / 1000);
    return (
      <div className="ig-card ig-generating" data-id={item.id}>
        <div className="ig-frame ig-shimmer" style={{ aspectRatio: ratioCss(item.ratio) }}>
          <span className="ig-spin" aria-hidden="true" />
          <span className="ig-genlabel">
            Generating · <span className="ig-elapsed">{elapsed}s</span>
          </span>
        </div>
        {meta}
      </div>
    );
  }

  if (item.state === "fail") {
    return (
      <div className="ig-card ig-fail" data-id={item.id}>
        <div className="ig-frame ig-failbox" style={{ aspectRatio: ratioCss(item.ratio) }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <p>{item.err || "Generation failed"}</p>
        </div>
        {meta}
        <div className="ig-card-actions">
          <button type="button" className="ig-act" onClick={() => onDelete(item)}>
            Remove
          </button>
        </div>
      </div>
    );
  }

  const url = item.urls[0] || "";
  return (
    <div className="ig-card ig-success" data-id={item.id}>
      <div
        className="ig-frame"
        style={{ aspectRatio: ratioCss(item.ratio), cursor: "pointer" }}
        onClick={() => onView(item)}
      >
        <img src={url} alt={item.prompt.slice(0, 120)} loading="lazy" />
        {item.urls.length > 1 && <span className="ig-multi">+{item.urls.length - 1}</span>}
      </div>
      {meta}
      <div className="ig-card-actions">
        <button type="button" className="ig-act" onClick={() => onView(item)}>
          View
        </button>
        <button type="button" className="ig-act" onClick={() => onDownload(item)}>
          Download
        </button>
        <button type="button" className="ig-act" onClick={() => onCopy(item)}>
          Copy URL
        </button>
        <button type="button" className="ig-act ig-act-danger" onClick={() => onDelete(item)}>
          Remove
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   PAGE
   ============================================================ */
export default function ImageStudioPage() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { spendCredits, syncCreditsFromServer, creditsExhausted } = useCredits();
  const toast = useToast();
  const [supabase] = useState(() => createClient());

  const storeKey = scopedKey("bsl_images", user?.email || "guest");

  const [items, setItems] = useState<GalleryItem[]>(() => {
    const stored = getJSON<GalleryItem[]>(storeKey);
    return Array.isArray(stored) ? stored : [];
  });

  const [modelId, setModelId] = useState(MODELS[0].id);
  const [ratio, setRatio] = useState(MODELS[0].ratios[1] || MODELS[0].ratios[0]);
  const [res, setRes] = useState("1K");
  const [prompt, setPrompt] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const refUrlRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const resumedRef = useRef(false);

  const model = useMemo(() => modelById(modelId), [modelId]);
  const resOptions = useMemo(() => resOptionsFor(model, ratio), [model, ratio]);

  const persist = useCallback(
    (list: GalleryItem[]) => {
      setJSON(storeKey, list.slice(0, 60));
    },
    [storeKey]
  );

  // Ticks the "elapsed" label on generating cards, once a second.
  useEffect(() => {
    if (!items.some((i) => i.state === "generating")) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [items]);

  // Escape closes the lightbox; background scroll is locked while it's open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxItem(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = lightboxItem ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightboxItem]);

  const finish = useCallback(
    (item: GalleryItem, res2: CheckResult) => {
      const timer = timersRef.current.get(item.id);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(item.id);

      setItems((prev) => {
        const next = prev.map((x) => {
          if (x.id !== item.id) return x;
          if (res2.done && res2.err) return { ...x, state: "fail" as const, err: res2.err };
          return {
            ...x,
            state: "success" as const,
            urls: (res2.done ? res2.urls : undefined) || [],
            credits: (res2.done ? res2.credits : undefined) ?? x.credits,
          };
        });
        persist(next);
        return next;
      });

      if (res2.done && res2.err) {
        toast(`${item.modelName}: ${res2.err}`);
      } else {
        toast(`Image ready · ${item.modelName}`, true);
        logActivity("creative", `Generated an image with ${item.modelName}`);
      }
    },
    [persist, toast, logActivity]
  );

  const startPolling = useCallback(
    (item: GalleryItem) => {
      if (timersRef.current.has(item.id)) return;
      function tick() {
        checkTask(supabase, item)
          .then((res2) => {
            if (res2.done) {
              finish(item, res2);
              return;
            }
            if (Date.now() - item.ts > POLL_TIMEOUT_MS) {
              finish(item, { done: true, err: "Timed out. The task may still complete on kie.ai" });
              return;
            }
            timersRef.current.set(item.id, setTimeout(tick, POLL_MS));
          })
          .catch(() => {
            if (Date.now() - item.ts > POLL_TIMEOUT_MS) {
              finish(item, { done: true, err: "Lost connection while waiting for the result" });
              return;
            }
            timersRef.current.set(item.id, setTimeout(tick, POLL_MS + 2000));
          });
      }
      timersRef.current.set(item.id, setTimeout(tick, POLL_MS));
    },
    [supabase, finish]
  );

  // Resume polling for tasks that were still generating on last visit.
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    items.forEach((item) => {
      if (item.state === "generating" && item.taskId) startPolling(item);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any pending timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  function selectModel(m: ModelDef) {
    setModelId(m.id);
    const nextRatio = m.ratios.includes(ratio) ? ratio : m.ratios.includes("1:1") ? "1:1" : m.ratios[0];
    if (nextRatio !== ratio) setRatio(nextRatio);
    const opts = resOptionsFor(m, nextRatio);
    if (opts && !opts.includes(res)) setRes(opts[0]);
  }

  function selectRatio(r: string) {
    setRatio(r);
    const opts = resOptionsFor(model, r);
    if (opts && !opts.includes(res)) setRes(opts[0]);
  }

  function handleCopy(item: GalleryItem) {
    navigator.clipboard.writeText(item.urls[0]).then(
      () => toast("Image URL copied", true),
      () => toast("Could not copy the URL")
    );
  }

  function handleDelete(item: GalleryItem) {
    const timer = timersRef.current.get(item.id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(item.id);
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== item.id);
      persist(next);
      return next;
    });
  }

  function handleClearAll() {
    if (!items.length) {
      toast("Nothing to clear");
      return;
    }
    if (!confirm("Remove all generations from this gallery? Images already downloaded are not affected.")) return;
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
    setItems([]);
    persist([]);
    toast("Gallery cleared", true);
  }

  async function handleGenerate() {
    const p = prompt.trim();
    const m = model;
    const ref = refUrl.trim();

    if (!p) {
      toast("Describe the image you want first");
      promptRef.current?.focus();
      return;
    }
    if (m.needsRef && !ref) {
      toast(`${m.name} needs a reference image URL`);
      refUrlRef.current?.focus();
      return;
    }
    if (ref && !/^https?:\/\//i.test(ref)) {
      toast("The reference image must be a public http(s) URL");
      refUrlRef.current?.focus();
      return;
    }

    if (!spendCredits("images", 1)) return;

    const params: GenParams = {
      prompt: p,
      ratio,
      res: resOptions ? res : null,
      ref: (m.needsRef || m.allowsRef) && ref ? ref : null,
    };

    setBusy(true);
    try {
      const taskId = await createTask(supabase, m, params, syncCreditsFromServer);
      const item: GalleryItem = {
        id: "img" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        taskId,
        api: m.api,
        modelId: m.id,
        modelName: m.name,
        prompt: p,
        ratio: params.ratio,
        res: params.res,
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
      toast(`Generation started · ${m.name}`, true);
    } catch (err) {
      if (err instanceof EdgeFunctionError && err.code === "out_of_credits") syncCreditsFromServer(err.remaining ?? 0);
      toast(err instanceof Error && err.message ? err.message : "Could not reach the image service");
    } finally {
      setBusy(false);
    }
  }

  const showRefField = Boolean(model.needsRef || model.allowsRef);

  if (creditsExhausted) return <CreditsLockedPage feature="Image studio" />;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>AI image studio</h2>
          <p className="page-sub">Generate images with the world&apos;s top models. Pick a model, write a prompt, choose a size.</p>
        </div>
      </div>

      <div className="ig-layout">
        {/* Controls */}
        <div className="panel ig-controls">
          <h3 className="ig-step">
            <span className="ig-step-n">1</span> Choose a model
          </h3>
          <div className="ig-models" id="igModels" role="radiogroup" aria-label="Image model">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`ig-model${m.id === model.id ? " active" : ""}`}
                role="radio"
                aria-checked={m.id === model.id}
                onClick={() => selectModel(m)}
              >
                <strong>
                  {m.name}
                  {m.tag && <span className="ig-tag">{m.tag}</span>}
                </strong>
                <span className="ig-vendor">{m.vendor}</span>
              </button>
            ))}
          </div>

          <h3 className="ig-step">
            <span className="ig-step-n">2</span> Describe your image
          </h3>
          <div className="field">
            <label className="sr-only" htmlFor="igPrompt">
              Prompt
            </label>
            <textarea
              className="input ig-prompt"
              id="igPrompt"
              rows={5}
              maxLength={5000}
              placeholder="A cinematic photo of a lighthouse on a cliff at golden hour, dramatic clouds, ultra detailed…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              ref={promptRef}
            />
            <p className="hint ig-count">
              <span id="igCount">{prompt.length}</span> / 5000
            </p>
          </div>
          <div className="field" id="igRefField" hidden={!showRefField}>
            <label htmlFor="igRefUrl">
              Reference image URL{" "}
              <span className="ig-req" id="igRefReq" hidden={!model.needsRef}>
                required
              </span>
            </label>
            <input
              className="input"
              id="igRefUrl"
              type="url"
              placeholder="https://…/photo.jpg"
              autoComplete="off"
              value={refUrl}
              onChange={(e) => setRefUrl(e.target.value)}
              ref={refUrlRef}
            />
            <p className="hint" id="igRefHint">
              {model.needsRef
                ? "This model edits or references an existing image. Paste a public image URL."
                : "Optional. Add an image URL to guide or edit, or leave empty for text-to-image."}
            </p>
          </div>

          <h3 className="ig-step">
            <span className="ig-step-n">3</span> Size
          </h3>
          <div className="ig-group">
            <span className="ig-label">Aspect ratio</span>
            <div className="ig-pills" id="igRatios" role="radiogroup" aria-label="Aspect ratio">
              {model.ratios.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`ig-pill${r === ratio ? " active" : ""}`}
                  role="radio"
                  aria-checked={r === ratio}
                  onClick={() => selectRatio(r)}
                >
                  {ratioBoxStyle(r) && <span className="ig-ratio-box" style={ratioBoxStyle(r)!} />}
                  <span>{r === "auto" ? "Auto" : r}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ig-group" id="igResGroup" hidden={!resOptions}>
            <span className="ig-label">Resolution</span>
            <div className="ig-pills" id="igRes" role="radiogroup" aria-label="Resolution">
              {(resOptions || []).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`ig-pill${r === res ? " active" : ""}`}
                  role="radio"
                  aria-checked={r === res}
                  onClick={() => setRes(r)}
                >
                  <span>{r}</span>
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="btn btn-primary ig-generate" id="igGenerate" onClick={handleGenerate} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
            </svg>
            <span className="btn-label" id="igGenerateLabel">
              {busy ? "Starting…" : "Generate image"}
            </span>
          </button>
          <p className="hint ig-foot">Powered by kie.ai</p>
        </div>

        {/* Results */}
        <div className="panel ig-results">
          <div className="panel-head">
            <div>
              <h3>Generations</h3>
              <p className="panel-sub">Hosted links expire after ~24 hours — download anything you want to keep.</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" id="igClear" onClick={handleClearAll}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Clear all
            </button>
          </div>
          <div className="ig-gallery" id="igGallery" aria-live="polite">
            {items.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                now={now}
                onView={setLightboxItem}
                onDownload={downloadImage}
                onCopy={handleCopy}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <div className="ig-empty" id="igEmpty" hidden={items.length > 0}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <p>
              Your generated images appear here.
              <br />
              Pick a model, describe your image and hit Generate.
            </p>
          </div>
        </div>
      </div>

      {lightboxItem && (
        <div
          className="ig-lightbox"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxItem(null);
          }}
        >
          <button type="button" className="ig-lb-close" aria-label="Close" onClick={() => setLightboxItem(null)}>
            ✕
          </button>
          <img src={lightboxItem.urls[0]} alt="Generated image" />
          <div className="ig-lb-bar">
            <span className="ig-lb-meta">
              {lightboxItem.modelName} · {lightboxItem.prompt.slice(0, 90)}
            </span>
            <button type="button" className="btn btn-primary btn-sm ig-lb-dl" onClick={() => downloadImage(lightboxItem)}>
              Download
            </button>
          </div>
        </div>
      )}
    </>
  );
}

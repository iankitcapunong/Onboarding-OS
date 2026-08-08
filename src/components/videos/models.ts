/* BSL 2.0 — Video studio model catalogue.
   Ported 1:1 from bsl-onboarding/js/videogen.js's MODELS array. Keep the
   data (ids, ratios, res, durs, audioKey/audioDefault, needsRef/allowsRef,
   api, veoModel, input()) identical to the vanilla source. */

import { videoCreditCost } from "@/lib/featureGating";

export type VideoApi = "veo" | "jobs";

export type VideoGenParams = {
  prompt: string;
  ratio: string | null;
  res: string | null;
  dur: string | null;
  audio: boolean;
  ref: string | null;
};

export type VideoModel = {
  id: string;
  name: string;
  vendor: string;
  tag?: string;
  api: VideoApi;
  /* veo-only */
  veoModel?: string;
  /* jobs-only */
  model?: string;
  input?: (p: VideoGenParams) => Record<string, unknown>;
  ratios: string[] | null;
  res: string[] | null;
  durs: (string | number)[] | null;
  audioKey?: string;
  audioDefault?: boolean;
  needsRef?: boolean;
  allowsRef?: boolean;
};

/* What one render on this model costs the user. The upstream kie.ai
   model string is the price key (see VIDEO_MODEL_COSTS) — it's the field
   the videogen Edge Function reads off the body it proxies, so client and
   server land on the same number for the same request. */
export function modelCreditCost(m: VideoModel): number {
  return videoCreditCost(m.api === "veo" ? m.veoModel : m.model);
}

export const MODELS: VideoModel[] = [
  {
    id: "veo31", name: "Veo 3.1", vendor: "Google", tag: "Audio",
    api: "veo", veoModel: "veo3",
    ratios: ["16:9", "9:16"], res: ["720p", "1080p"], durs: [4, 6, 8], allowsRef: true,
  },
  {
    id: "veo31-fast", name: "Veo 3.1 Fast", vendor: "Google", tag: "Fast",
    api: "veo", veoModel: "veo3_fast",
    ratios: ["16:9", "9:16"], res: ["720p", "1080p"], durs: [4, 6, 8], allowsRef: true,
  },
  {
    id: "kling30", name: "Kling 3.0", vendor: "Kuaishou", tag: "New",
    api: "jobs", model: "kling-3.0/video",
    ratios: ["16:9", "9:16", "1:1"], res: null, durs: ["5", "10", "15"],
    audioKey: "sound", audioDefault: true,
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, duration: String(p.dur), mode: "pro", sound: !!p.audio, multi_shots: false }),
  },
  {
    id: "kling26", name: "Kling 2.6", vendor: "Kuaishou",
    api: "jobs", model: "kling-2.6/text-to-video",
    ratios: ["16:9", "9:16", "1:1"], res: null, durs: ["5", "10"],
    audioKey: "sound", audioDefault: false,
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, duration: String(p.dur), sound: !!p.audio }),
  },
  {
    id: "kling25", name: "Kling 2.5 Turbo", vendor: "Kuaishou",
    api: "jobs", model: "kling/v2-5-turbo-text-to-video-pro",
    ratios: ["16:9", "9:16", "1:1"], res: null, durs: ["5", "10"],
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, duration: String(p.dur), cfg_scale: 0.5 }),
  },
  {
    id: "kling21", name: "Kling 2.1 Master", vendor: "Kuaishou",
    api: "jobs", model: "kling/v2-1-master-text-to-video",
    ratios: ["16:9", "9:16", "1:1"], res: null, durs: ["5", "10"],
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, duration: String(p.dur), cfg_scale: 0.5 }),
  },
  {
    id: "wan27", name: "Wan 2.7", vendor: "Alibaba", tag: "New",
    api: "jobs", model: "wan/2-7-text-to-video",
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"], res: ["720p", "1080p"], durs: [5, 8, 10, 15],
    input: (p) => ({ prompt: p.prompt, ratio: p.ratio, resolution: p.res, duration: Number(p.dur), prompt_extend: true, watermark: false }),
  },
  {
    id: "wan25", name: "Wan 2.5", vendor: "Alibaba",
    api: "jobs", model: "wan/2-5-text-to-video",
    ratios: ["16:9", "9:16", "1:1"], res: ["720p", "1080p"], durs: ["5", "10"],
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, resolution: p.res, duration: String(p.dur), enable_prompt_expansion: true }),
  },
  {
    id: "wan22", name: "Wan 2.2 Turbo", vendor: "Alibaba", tag: "Fast",
    api: "jobs", model: "wan/2-2-a14b-text-to-video-turbo",
    ratios: ["16:9", "9:16"], res: ["480p", "720p"], durs: null,
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, resolution: p.res }),
  },
  {
    id: "grok", name: "Grok Imagine", vendor: "xAI",
    api: "jobs", model: "grok-imagine/text-to-video",
    ratios: ["16:9", "9:16", "1:1", "3:2", "2:3"], res: ["480p", "720p"], durs: [6, 10, 15],
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, resolution: p.res, duration: Number(p.dur), mode: "normal" }),
  },
  {
    id: "seedance2", name: "Seedance 2.0", vendor: "ByteDance", tag: "Audio",
    api: "jobs", model: "bytedance/seedance-2",
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], res: ["480p", "720p", "1080p"], durs: [5, 8, 10, 12],
    audioKey: "generate_audio", audioDefault: true,
    input: (p) => ({ prompt: p.prompt, aspect_ratio: p.ratio, resolution: p.res, duration: Number(p.dur), generate_audio: !!p.audio }),
  },
  {
    id: "seedance15", name: "Seedance 1.5 Pro", vendor: "ByteDance", allowsRef: true,
    api: "jobs", model: "bytedance/seedance-1.5-pro",
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], res: ["480p", "720p", "1080p"], durs: [4, 8, 12],
    audioKey: "generate_audio", audioDefault: false,
    input: (p) => {
      const i: Record<string, unknown> = { prompt: p.prompt, aspect_ratio: p.ratio, resolution: p.res, duration: Number(p.dur), generate_audio: !!p.audio };
      if (p.ref) i.input_urls = [p.ref];
      return i;
    },
  },
  {
    id: "hailuo23", name: "Hailuo 2.3 Pro", vendor: "MiniMax", tag: "Img → video", needsRef: true,
    api: "jobs", model: "hailuo/2-3-image-to-video-pro",
    ratios: null, res: ["768P", "1080P"], durs: ["6", "10"],
    input: (p) => {
      /* 10s clips are unavailable at 1080P on this model */
      const res = String(p.dur) === "10" ? "768P" : p.res;
      return { prompt: p.prompt, image_url: p.ref, duration: String(p.dur), resolution: res };
    },
  },
];

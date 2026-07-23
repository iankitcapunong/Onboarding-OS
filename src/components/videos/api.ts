/* BSL 2.0 — Video studio task create/poll helpers.
   Ported 1:1 from bsl-onboarding/js/videogen.js's createTask()/checkTask(). */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callVideogen } from "@/lib/edgeFunctions";
import type { VideoGenParams, VideoModel } from "./models";

export const POLL_MS = 8000;
export const POLL_TIMEOUT_MS = 30 * 60 * 1000;

export type VideoItemState = "generating" | "success" | "fail";

export type VideoItem = {
  id: string;
  taskId: string;
  api: "veo" | "jobs";
  modelId: string;
  modelName: string;
  prompt: string;
  ratio: string | null;
  res: string | null;
  dur: string | null;
  state: VideoItemState;
  urls: string[];
  ts: number;
  err?: string;
  credits?: number;
};

type KieEnvelope = {
  code?: number;
  msg?: string;
  data?: Record<string, unknown>;
  _bslRemaining?: number;
};

export async function createTask(
  supabase: SupabaseClient,
  m: VideoModel,
  p: VideoGenParams,
  syncCreditsFromServer: (remaining: number) => void
): Promise<string> {
  let path: string;
  let body: Record<string, unknown>;

  if (m.api === "veo") {
    path = "/api/v1/veo/generate";
    const veoBody: Record<string, unknown> = {
      prompt: p.prompt,
      model: m.veoModel,
      aspect_ratio: p.ratio,
      resolution: p.res,
      duration: Number(p.dur),
    };
    if (p.ref) veoBody.imageUrls = [p.ref];
    body = veoBody;
  } else {
    path = "/api/v1/jobs/createTask";
    body = { model: m.model, input: m.input ? m.input(p) : {} };
  }

  const j = await callVideogen<KieEnvelope>(supabase, "POST", path, body);
  if (j && typeof j._bslRemaining === "number") syncCreditsFromServer(j._bslRemaining);
  const taskId = j?.data?.taskId;
  if (!j || j.code !== 200 || !j.data || typeof taskId !== "string") {
    throw new Error((j && j.msg) || "The video service rejected the request");
  }
  return taskId;
}

export type CheckResult = { done: boolean; err?: string; urls?: string[]; credits?: number };

export async function checkTask(supabase: SupabaseClient, item: VideoItem): Promise<CheckResult> {
  const path =
    item.api === "veo"
      ? "/api/v1/veo/record-info?taskId=" + encodeURIComponent(item.taskId)
      : "/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(item.taskId);

  const j = await callVideogen<KieEnvelope>(supabase, "GET", path, null);
  if (!j || j.code !== 200) return { done: true, err: (j && j.msg) || "Status check failed" };
  const d = j.data || {};

  if (item.api === "veo") {
    const successFlag = d.successFlag as number | undefined;
    if (successFlag === 1) {
      const resp = (d.response as Record<string, unknown>) || {};
      let u = (resp.resultUrls ?? resp.fullResultUrls ?? []) as unknown;
      if (typeof u === "string") {
        try {
          u = JSON.parse(u);
        } catch {
          u = [u];
        }
      }
      const urls = Array.isArray(u) ? (u as string[]) : [];
      return urls.length ? { done: true, urls } : { done: true, err: "No video returned" };
    }
    if (successFlag === 2 || successFlag === 3) {
      return { done: true, err: (d.errorMessage as string) || "Generation failed" };
    }
    return { done: false };
  }

  if (d.state === "success") {
    let rj: Record<string, unknown> = {};
    try {
      rj = JSON.parse((d.resultJson as string) || "{}");
    } catch {
      rj = {};
    }
    const result = rj.result as Record<string, unknown> | undefined;
    const u2 = (rj.resultUrls ?? result?.resultUrls ?? []) as unknown;
    const urls2 = Array.isArray(u2) ? (u2 as string[]) : [];
    if (!urls2.length) return { done: true, err: "No video returned" };
    return { done: true, urls: urls2, credits: d.creditsConsumed as number | undefined };
  }
  if (d.state === "fail") return { done: true, err: (d.failMsg as string) || "Generation failed" };
  return { done: false };
}

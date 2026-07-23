/* Shared small helpers for the video studio gallery/lightbox. */

export function ratioCss(r: string | null): string {
  if (!r) return "16 / 9";
  return r.replace(":", " / ");
}

export function formatElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

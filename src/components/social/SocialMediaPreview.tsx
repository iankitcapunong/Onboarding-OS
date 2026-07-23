import type { SocialMediaMeta } from "@/lib/socialTemplates";

/* Renders the attached image/video (live preview if we still hold the
   object URL this session, otherwise a filename chip) or null if there's
   no attachment — shared between the read view and the edit form.
   Direct replacement for js/app.js's socialMediaEl(). */
export function SocialMediaPreview({ media, url, name }: { media: SocialMediaMeta | null; url: string | undefined; name?: string }) {
  if (!url && !media) return null;
  const isVideo = !!(media?.type && media.type.indexOf("video") === 0);

  if (url) {
    return isVideo ? (
      <video className="social-media-thumb" src={url} controls />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="social-media-thumb" src={url} alt={media?.name || name || "Attached image"} />
    );
  }

  return <span className="social-media-chip">{(isVideo ? "🎥 " : "🖼️ ") + (media?.name || "")}</span>;
}

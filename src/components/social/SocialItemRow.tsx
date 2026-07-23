"use client";

import { spinText } from "@/lib/assetTemplates";
import { socialFullText, socialWhen, type SocialItem } from "@/lib/socialTemplates";
import { SocialMediaPreview } from "./SocialMediaPreview";

/* Read-mode row. Direct replacement for js/app.js's socialRowEl() (the
   non-editing branch). */
export function SocialItemRow({
  item,
  inQueue,
  mediaUrl,
  onEdit,
  onCopy,
  onToggleSchedule,
  onDelete,
}: {
  item: SocialItem;
  inQueue: boolean;
  mediaUrl: string | undefined;
  onEdit: (item: SocialItem) => void;
  onCopy: (item: SocialItem) => void;
  onToggleSchedule: (item: SocialItem) => void;
  onDelete: (item: SocialItem) => void;
}) {
  const meta = inQueue
    ? `Queued · ${socialWhen(item.scheduled as string)} (simulated)`
    : `${item.session ? item.session + " · " : ""}Draft`;

  return (
    <li className="social-item">
      <div className="social-item-head">
        <span className="social-chip">{item.platform}</span>
        <span className="social-meta">{meta}</span>
        <span className="social-actions">
          <button type="button" className="ig-act" onClick={() => onEdit(item)}>
            Edit
          </button>
          <button type="button" className="ig-act" onClick={() => onCopy(item)}>
            Copy
          </button>
          <button type="button" className="ig-act" onClick={() => onToggleSchedule(item)}>
            {inQueue ? "Unschedule" : "Schedule"}
          </button>
          <button type="button" className="ig-act ig-act-danger" onClick={() => onDelete(item)}>
            Delete
          </button>
        </span>
      </div>
      <pre className="social-text">{spinText(socialFullText(item))}</pre>
      {(mediaUrl || item.media) && (
        <div className="social-media-wrap">
          <SocialMediaPreview media={item.media} url={mediaUrl} />
        </div>
      )}
    </li>
  );
}

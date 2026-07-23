"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/app/ToastProvider";
import type { SocialItem, SocialMediaMeta } from "@/lib/socialTemplates";
import { SocialMediaPreview } from "./SocialMediaPreview";

export type SocialEditSave = {
  caption: string;
  hashtags: string;
  media: SocialMediaMeta | null;
  /** set when a new file was attached — the caller owns transferring this into its object-URL map */
  newObjectUrl: string | null;
  /** true when the attachment was explicitly removed (and no new file replaced it) */
  removed: boolean;
};

/* Inline edit row. Direct replacement for js/app.js's socialEditRowEl().
   Object URLs for a newly-picked file live in local state so the preview
   can render immediately; ownership only transfers to the caller's
   tracking map on Save (see the parent's mediaUrlsRef) — until then, an
   effect revokes the pending URL whenever it's replaced, removed, or the
   row unmounts without saving (Cancel, or navigating away mid-edit). */
export function SocialEditRow({
  item,
  existingUrl,
  onCancel,
  onSave,
}: {
  item: SocialItem;
  existingUrl: string | undefined;
  onCancel: () => void;
  onSave: (item: SocialItem, payload: SocialEditSave) => void;
}) {
  const toast = useToast();
  const [caption, setCaption] = useState(item.caption ?? "");
  const [hashtags, setHashtags] = useState(item.hashtags || "");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [mediaRemoved, setMediaRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!committedRef.current && pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
  }, [pendingUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\/|^video\//.test(file.type)) {
      toast("Attach an image or video file");
      e.target.value = "";
      return;
    }
    setPendingFile(file);
    setPendingUrl(URL.createObjectURL(file));
    setMediaRemoved(false);
  }

  function handleRemoveMedia() {
    setPendingFile(null);
    setPendingUrl(null);
    setMediaRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCancel() {
    onCancel();
  }

  function handleSave() {
    committedRef.current = true;
    const media: SocialMediaMeta | null = pendingFile ? { name: pendingFile.name, type: pendingFile.type } : mediaRemoved ? null : item.media;
    onSave(item, {
      caption: caption.trim(),
      hashtags: hashtags.trim(),
      media,
      newObjectUrl: pendingFile ? pendingUrl : null,
      removed: !pendingFile && mediaRemoved,
    });
  }

  const hasVisibleMedia = !!pendingUrl || (!mediaRemoved && (!!existingUrl || !!item.media));
  const previewUrl = pendingUrl || (!mediaRemoved ? existingUrl : undefined);
  const previewMedia = pendingFile ? { name: pendingFile.name, type: pendingFile.type } : !mediaRemoved ? item.media : null;

  return (
    <li className="social-item social-item-editing">
      <div className="social-item-head">
        <span className="social-chip">{item.platform}</span>
        <span className="social-meta">Editing</span>
      </div>
      <div className="field">
        <label htmlFor={`social-caption-${item.id}`}>Caption</label>
        <textarea
          id={`social-caption-${item.id}`}
          className="input social-edit-caption"
          rows={4}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`social-hashtags-${item.id}`}>Hashtags</label>
        <input
          id={`social-hashtags-${item.id}`}
          className="input social-edit-hashtags"
          type="text"
          placeholder="#smallbusiness #growth"
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`social-media-${item.id}`}>Image or video</label>
        <input
          id={`social-media-${item.id}`}
          ref={fileInputRef}
          className="input social-edit-media"
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
        />
        {hasVisibleMedia && (
          <div className="social-media-preview">
            <SocialMediaPreview media={previewMedia} url={previewUrl} />
          </div>
        )}
      </div>
      <div className="social-genrow social-edit-actions">
        {hasVisibleMedia && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleRemoveMedia}>
            Remove media
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>
          Save
        </button>
      </div>
    </li>
  );
}

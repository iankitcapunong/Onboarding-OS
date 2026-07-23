"use client";

import { useEffect, useRef, useState } from "react";
import { useBrible } from "@/hooks/useBrible";
import { DESIGN_TOKENS, QUICK_FONTS, tokenValue, type DesignToken } from "@/lib/bribleEngine";

/* Direct port of the Design mode panel: bribleRenderOutlinePanel()/
   bribleWireOutlineDrag() (drag-to-reorder, HTML5 drag events) and
   bribleRenderTokenPanel()/bribleApplyToken() (lines ~4266-4461 of
   js/app.js). Token fields remount (via `key={activeVersion.id}` on
   their container) whenever a new version is pushed — including by
   applyToken() itself — so they always reflect the true persisted
   value instead of needing an effect to resync local draft state
   against outside changes. */
export function DesignPanel() {
  const { activeVersion, sectionOutline, moveSection, duplicateSection, deleteSection, reorderSections, applyToken } = useBrible();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const shell = activeVersion?.shellHtml || null;

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = sectionOutline.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    reorderSections(ids);
  }

  return (
    <aside className="brible-design-panel">
      <div className="bdp-section">
        <h3>Layout</h3>
        {sectionOutline.length ? (
          <div className="bdp-outline">
            {sectionOutline.map((item, i) => (
              <div
                key={item.id}
                className={`bdp-row${dragId === item.id ? " dragging" : ""}${dragOverId === item.id ? " drag-over" : ""}`}
                draggable
                onDragStart={() => setDragId(item.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== item.id) setDragOverId(item.id);
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverId(null);
                  handleDrop(item.id);
                }}
              >
                <span className="bdp-row-label">{item.label}</span>
                <button type="button" className="bdp-row-btn" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => moveSection(item.id, -1)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 15l-6-6-6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="bdp-row-btn"
                  title="Move down"
                  aria-label="Move down"
                  disabled={i === sectionOutline.length - 1}
                  onClick={() => moveSection(item.id, 1)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <button type="button" className="bdp-row-btn" title="Duplicate" aria-label="Duplicate" onClick={() => duplicateSection(item.id)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 8h10v10H8zM4 4h10v10H4z" />
                  </svg>
                </button>
                <button type="button" className="bdp-row-btn bdp-danger" title="Delete" aria-label="Delete" onClick={() => deleteSection(item.id)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="bdp-empty">This version doesn&apos;t have editable sections yet — build or rebuild the page to unlock the layout editor.</p>
        )}
      </div>

      <div className="bdp-section">
        <h3>Theme</h3>
        {shell ? (
          <div className="bdp-tokens" key={activeVersion?.id}>
            {DESIGN_TOKENS.map((tok) => (
              <TokenField key={tok.name} tok={tok} shell={shell} onApply={applyToken} />
            ))}
          </div>
        ) : (
          <p className="bdp-empty">This version doesn&apos;t have editable theme tokens yet — build or rebuild the site to unlock the theme editor.</p>
        )}
      </div>
    </aside>
  );
}

function TokenField({ tok, shell, onApply }: { tok: DesignToken; shell: string; onApply: (name: string, value: string) => void }) {
  const initial = tokenValue(shell, tok.name);

  if (tok.type === "segmented") {
    return (
      <div className="bdp-field">
        <label>{tok.label}</label>
        <div className="bdp-segmented">
          {(tok.options || []).map((opt) => (
            <button key={opt.value} type="button" className={initial === opt.value ? "active" : ""} onClick={() => onApply(tok.name, opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (tok.type === "color") {
    return <ColorTokenField tok={tok} initial={initial} onApply={onApply} />;
  }

  return <FontTokenField tok={tok} initial={initial} onApply={onApply} />;
}

function ColorTokenField({ tok, initial, onApply }: { tok: DesignToken; initial: string; onApply: (name: string, value: string) => void }) {
  const [value, setValue] = useState(initial);
  const swatchRef = useRef<HTMLInputElement>(null);

  // the swatch's real "commit" moment is the native `change` event (fired
  // when the color picker closes) — React's onChange fires continuously
  // like `input` while dragging, so a plain listener is used to apply
  // only once the user has actually picked a color, matching the
  // original's separate `input` (live-sync the text field) vs `change`
  // (apply) listeners.
  useEffect(() => {
    const el = swatchRef.current;
    if (!el) return;
    function commit() {
      if (el) onApply(tok.name, el.value);
    }
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, [tok.name, onApply]);

  const swatchValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";

  return (
    <div className="bdp-field">
      <label>{tok.label}</label>
      <div className="bdp-color-row">
        <input ref={swatchRef} type="color" value={swatchValue} onChange={(e) => setValue(e.target.value)} />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value.trim()) onApply(tok.name, value.trim());
          }}
        />
      </div>
    </div>
  );
}

function FontTokenField({ tok, initial, onApply }: { tok: DesignToken; initial: string; onApply: (name: string, value: string) => void }) {
  const [value, setValue] = useState(initial);

  return (
    <div className="bdp-field">
      <label>{tok.label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim()) onApply(tok.name, value.trim());
        }}
      />
      <div className="bdp-quickfonts">
        {QUICK_FONTS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setValue(f);
              onApply(tok.name, f);
            }}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

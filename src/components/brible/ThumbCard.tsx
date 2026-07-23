"use client";

/* Direct port of js/app.js's bribleThumbCard() (lines ~5203-5230): a
   clickable card with a sandboxed, fully-inert thumbnail iframe (empty
   sandbox — never interactive, decorative preview only, unlike the main
   builder preview iframe which needs sandbox="allow-scripts"). Used by
   both the "My sites" gallery and the "From the Community" grid. */
export function ThumbCard({
  title,
  meta,
  html,
  onClick,
  badge,
}: {
  title: string;
  meta: string;
  html?: string;
  onClick: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button type="button" className="bh-card" onClick={onClick}>
      <div className="bh-thumb">
        {html && <iframe sandbox="" tabIndex={-1} aria-hidden="true" loading="lazy" srcDoc={html} title="" />}
        {badge}
      </div>
      <div className="bh-card-info">
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
    </button>
  );
}

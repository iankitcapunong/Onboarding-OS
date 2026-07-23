"use client";

import { useBrible } from "@/hooks/useBrible";

/* Direct port of js/app.js's bribleRenderVersions() (lines ~4564-4585). */
export function VersionsBar() {
  const { versions, activeVersion, setActiveVersion } = useBrible();

  if (!versions.length) return <div className="brible-versions" />;

  return (
    <div className="brible-versions">
      <span className="bver-label">Versions:</span>
      {versions.map((v, i) => (
        <button
          key={v.id}
          type="button"
          className={`bver${activeVersion?.id === v.id ? " active" : ""}`}
          title={`${v.prompt || "Generated"} · ${v.themeKey} theme`}
          onClick={() => setActiveVersion(v.id)}
        >
          v{i + 1}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useBrible } from "@/hooks/useBrible";
import { useCredits } from "@/hooks/useCredits";
import { BribleHome } from "@/components/brible/BribleHome";
import { BribleBuilder } from "@/components/brible/BribleBuilder";
import { CreditsLockedPage } from "@/components/app/CreditsLockedPage";

/* Direct replacement for app.html's #route-brible + js/app.js's home
   ⇄ builder view toggle (bribleShowHome()/bribleShowBuilder(), lines
   ~5182-5201): a local, unpersisted `view` state standing in for the
   original's `hidden` attribute swap on #bribleHome/#bribleBuilder,
   defaulting to whichever the original defaulted to (builder if a
   project already exists, home otherwise — see the very last line of
   the original's Brible section). Also reproduces the original's
   `document.body.classList.toggle("brible-active", ...)` (js/app.js
   line 618) that the app's global CSS relies on for the full-bleed,
   no-padding layout unique to this route (see .brible-active rules in
   src/styles/app.css). */
export default function BriblePage() {
  const { versions } = useBrible();
  const { aiLocked } = useCredits();
  const [view, setView] = useState<"home" | "builder">(() => (versions.length ? "builder" : "home"));

  useEffect(() => {
    if (aiLocked) return;
    document.body.classList.add("brible-active");
    return () => {
      document.body.classList.remove("brible-active");
    };
  }, [aiLocked]);

  if (aiLocked) return <CreditsLockedPage feature="Brible websites" />;

  return (
    <div className="brible-shell">
      {view === "home" ? <BribleHome onShowBuilder={() => setView("builder")} /> : <BribleBuilder onShowHome={() => setView("home")} />}
    </div>
  );
}

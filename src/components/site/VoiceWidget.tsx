"use client";

import { useEffect, useRef } from "react";

const LOADER_SRC = "https://widgets.leadconnectorhq.com/loader.js";
const RESOURCES_URL = "https://widgets.leadconnectorhq.com/chat-widget/loader.js";
const WIDGET_ID = "6a6358b47dc24a6d502412cd";
const LOCATION_ID = "DF0hgE2BLIjnHvglyVyx";

/* The LeadConnector loader script attaches its <chat-widget> element as a
   sibling of wherever its <script> tag lives, then renders its own launcher
   with `position: fixed`. Appending the script into our own container (via
   this ref) — instead of <body> — keeps the widget an actual descendant of
   `.voice-widget-slot`. Combined with the `transform` on that slot (see
   app.css/landing.css), that gives the fixed-position launcher a new
   containing block, so it stays trapped inside the card instead of
   floating over the whole viewport. It also lets us tear the widget back
   down on unmount instead of it surviving client-side route changes. */
export function VoiceWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // GHL's current embed snippet pairs the loader script with an explicit
    // host <div data-chat-widget>, carrying data-location-id — matches
    // what the dashboard's "Get code" now generates (confirmed this alone
    // doesn't fix the call button being inert; kept for parity with GHL's
    // current snippet regardless).
    const host = document.createElement("div");
    host.setAttribute("data-chat-widget", "");
    host.setAttribute("data-widget-id", WIDGET_ID);
    host.setAttribute("data-location-id", LOCATION_ID);
    container.appendChild(host);

    const script = document.createElement("script");
    script.src = LOADER_SRC;
    script.setAttribute("data-resources-url", RESOURCES_URL);
    script.setAttribute("data-widget-id", WIDGET_ID);
    container.appendChild(script);

    return () => {
      container.querySelectorAll("script, chat-widget, [data-chat-widget]").forEach((el) => el.remove());
    };
  }, []);

  return <div ref={containerRef} className="voice-widget-host" />;
}

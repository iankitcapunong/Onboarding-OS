"use client";

import { useEffect, useRef } from "react";

/* The LeadConnector (GoHighLevel) chat widget — the AI onboarding agent.

   HISTORY, read before debugging this: a previous LeadConnector *voice*
   widget was removed in 8faf662 because its underlying GHL account had a
   stuck/deleted agent reference that survived "every widget, agent, and
   embed variation tried". That was an account-side fault, not an embed
   fault — so if this widget renders but the agent doesn't respond, the
   problem is in GHL, not in this file. Check there first.

   The loader attaches its <chat-widget> element as a sibling of wherever
   its <script> tag lives, then renders its own launcher with
   `position: fixed`. Appending the script into our own container (via this
   ref) — instead of <body> — keeps the widget an actual descendant of
   `.voice-widget-slot`. Combined with the `transform` on that slot (see
   app.css), that gives the fixed-position launcher a new containing block,
   so it stays trapped inside the card instead of floating over the whole
   viewport. It also lets us tear the widget back down on unmount, instead
   of it surviving client-side route changes. */

const LOADER_SRC = "https://widgets.leadconnectorhq.com/loader.js";
const RESOURCES_URL = "https://widgets.leadconnectorhq.com/chat-widget/loader.js";
const WIDGET_ID = "6a0dafc75589daf0dd8d9489";

export function AgentWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const script = document.createElement("script");
    script.src = LOADER_SRC;
    script.setAttribute("data-resources-url", RESOURCES_URL);
    script.setAttribute("data-widget-id", WIDGET_ID);
    container.appendChild(script);

    return () => {
      container
        .querySelectorAll("script, chat-widget, [data-chat-widget]")
        .forEach((el) => el.remove());
    };
  }, []);

  return <div ref={containerRef} className="voice-widget-host" />;
}

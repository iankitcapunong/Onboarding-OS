"use client";

import { useEffect, useRef } from "react";

/* The LeadConnector (GoHighLevel) chat widget — the AI onboarding agent.

   HISTORY, read before debugging this: a previous LeadConnector *voice*
   widget was removed in 8faf662 because its underlying GHL account had a
   stuck/deleted agent reference that survived "every widget, agent, and
   embed variation tried". That was an account-side fault, not an embed
   fault — so if this widget renders but the agent doesn't respond, the
   problem is in GHL, not in this file. Check there first.

   CONTAINMENT: older loader builds attached <chat-widget> as a sibling
   of their <script> tag, so appending the script inside our container
   was enough to trap the fixed-position launcher within
   .voice-widget-slot's transform containing block. The CURRENT loader
   appends the widget straight to document.body — outside React's tree —
   which made the launcher float over the whole viewport and, because
   unmount cleanup only swept inside the container, SURVIVE client-side
   navigation onto every other page. Two fixes:

   1. A MutationObserver adopts any widget node the loader drops on
      <body> back into our container, restoring the containing-block
      trap on this page.
   2. Unmount sweeps the WHOLE document (plus two delayed passes, since
      the loader injects asynchronously and can land after unmount). */

const LOADER_SRC = "https://widgets.leadconnectorhq.com/loader.js";
const RESOURCES_URL = "https://widgets.leadconnectorhq.com/chat-widget/loader.js";
const WIDGET_ID = "6a638470b92307bb1e33ca1c";

const WIDGET_SELECTOR = [
  "chat-widget",
  "[data-chat-widget]",
  `script[src*="leadconnectorhq.com"]`,
  `iframe[src*="leadconnectorhq.com"]`,
].join(", ");

function removeWidgetNodes() {
  document.querySelectorAll(WIDGET_SELECTOR).forEach((el) => el.remove());
}

// Module-level so a remount can cancel the previous unmount's delayed
// sweeps instead of having them delete the freshly-loaded widget.
const pendingSweeps: number[] = [];

export function AgentWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    while (pendingSweeps.length) window.clearTimeout(pendingSweeps.pop());

    // Adopt loader-injected widget nodes that land on <body> so the
    // launcher stays trapped inside the card on this page.
    const observer = new MutationObserver(() => {
      document.querySelectorAll("chat-widget, [data-chat-widget]").forEach((el) => {
        if (!container.contains(el)) container.appendChild(el);
      });
    });
    observer.observe(document.body, { childList: true });

    const script = document.createElement("script");
    script.src = LOADER_SRC;
    script.setAttribute("data-resources-url", RESOURCES_URL);
    script.setAttribute("data-widget-id", WIDGET_ID);
    container.appendChild(script);

    return () => {
      observer.disconnect();
      removeWidgetNodes();
      // The loader resolves asynchronously — a widget injected after
      // unmount would otherwise haunt every page until a full reload.
      // (Cancelled on remount so a quick return to this page doesn't
      // have a stale sweep delete the freshly-loaded widget.)
      pendingSweeps.push(
        window.setTimeout(removeWidgetNodes, 800),
        window.setTimeout(removeWidgetNodes, 3000)
      );
    };
  }, []);

  return <div ref={containerRef} className="voice-widget-host" />;
}

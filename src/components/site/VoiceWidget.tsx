"use client";

import { useEffect } from "react";

const LOADER_SRC = "https://widgets.leadconnectorhq.com/loader.js";
const RESOURCES_URL = "https://widgets.leadconnectorhq.com/chat-widget/loader.js";
const WIDGET_ID = "6a4b63c6f73312b761c5f155";

/* The LeadConnector loader script attaches its own floating <chat-widget>
   element directly to <body>, outside React's tree. Next's <Script>
   component only manages the loader <script> tag itself, so on a
   client-side route change the floating widget survives and keeps
   showing on pages that never asked for it. Injecting the script
   ourselves lets us tear the widget back down on unmount. */
export function VoiceWidget() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = LOADER_SRC;
    script.setAttribute("data-resources-url", RESOURCES_URL);
    script.setAttribute("data-widget-id", WIDGET_ID);
    document.body.appendChild(script);

    return () => {
      script.remove();
      document.querySelectorAll("chat-widget").forEach((el) => el.remove());
    };
  }, []);

  return null;
}

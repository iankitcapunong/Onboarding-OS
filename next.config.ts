import type { NextConfig } from "next";

// Never ship browser source maps in production — with them, the app's
// client bundle (minified but otherwise complete) is trivially readable
// in devtools. This is already Next's default; set explicitly so it
// can't be silently flipped on later.
const PRODUCTION_BROWSER_SOURCE_MAPS = false;

// Supabase's REST/auth/functions endpoint — the only first-party backend
// this app talks to from the browser (see src/lib/edgeFunctions.ts,
// src/lib/supabase/client.ts). Read from env so staging/prod can point
// at different projects without editing this file.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// The only third-party <script> this app loads (src/components/site/AgentWidget.tsx)
// is the LeadConnector chat widget — but its own runtime pulls in several
// more of its subdomains (services.* for its session/config API, stcdn.*
// for phone-input libraries) plus msgsndr.com (GoHighLevel's backend infra
// — a session-attribution call). Wildcarding each vendor's subdomains is
// simpler and more robust than enumerating them, since it's a black-box
// widget that may add more without notice.
//
// These were removed in 8faf662 when the previous voice widget was pulled,
// and are restored here for the chat widget. Without them the loader is
// blocked by CSP and fails silently — which is indistinguishable from the
// widget itself being broken, so don't debug the widget before checking
// devtools for CSP violations.
const LEADCONNECTOR_ORIGIN = "https://*.leadconnectorhq.com";
const MSGSNDR_ORIGIN = "https://*.msgsndr.com";

// GHL's Conversation AI voice feature routes actual call audio through
// Retell AI over LiveKit Cloud (observed live: wss://retell-ai-<id>.livekit.cloud
// for RTC signaling, https://<same host>/settings/regions and /rtc/v1/validate
// for setup). Without this, connect-src blocks every one of those requests —
// the widget loads and the click "works" (mic prompt fires), but the call
// itself can never connect. Wildcarded since the per-project subdomain isn't
// fixed or discoverable from source.
const LIVEKIT_WS_ORIGIN = "wss://*.livekit.cloud";
const LIVEKIT_HTTPS_ORIGIN = "https://*.livekit.cloud";

// A third-party font CDN (fonts.bunny.net) — confirmed live by loading
// the page under this CSP and watching devtools for violations.
const BUNNY_FONTS_ORIGIN = "https://fonts.bunny.net";

// React needs eval() in development for its debug/error-overlay tooling
// (see node_modules/next/dist/docs/.../content-security-policy.md's own
// "Good to know" note); not needed and not included in production.
const IS_DEV = process.env.NODE_ENV === "development";

// img-src/media-src are intentionally left at `https:` rather than a
// pinned allowlist: generated-image/video URLs come back from kie.ai's
// Jobs API at runtime (src/app/app/images/page.tsx, src/app/app/videos/page.tsx)
// on a CDN host that isn't fixed or discoverable from source, and
// AI-generated site/ad HTML (rendered in the Brible/CreativeModal srcDoc
// iframes, which inherit the parent document's CSP per spec) embeds
// images.unsplash.com (src/lib/creativeBuilders.ts). Pinning this to a
// specific host list would break real generated content; script-src
// stays tight since that's the directive that actually matters for XSS.
const CSP_DIRECTIVES = [
  `default-src 'self'`,
  // 'unsafe-inline' (not a nonce): this app has no confirmed injection
  // vector (no dangerouslySetInnerHTML/innerHTML anywhere in src/), and
  // a nonce-based CSP would force every page — including the static
  // marketing pages — into dynamic rendering, and still wouldn't cover
  // the inline BRIBLE_EDIT_JS script injected into the AI site preview's
  // srcDoc iframe without separate special-casing. See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md's
  // own "Without Nonces" section for this exact trade-off.
  `script-src 'self' 'unsafe-inline' ${LEADCONNECTOR_ORIGIN}${IS_DEV ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline' ${BUNNY_FONTS_ORIGIN}`,
  `img-src 'self' blob: data: https:`,
  `media-src 'self' blob: https:`,
  `font-src 'self' ${BUNNY_FONTS_ORIGIN}`,
  `connect-src 'self' ${SUPABASE_URL} ${LEADCONNECTOR_ORIGIN} ${MSGSNDR_ORIGIN} ${LIVEKIT_WS_ORIGIN} ${LIVEKIT_HTTPS_ORIGIN}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: PRODUCTION_BROWSER_SOURCE_MAPS,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
          // Belt-and-suspenders with frame-ancestors 'none' above — older
          // browsers that don't support CSP frame-ancestors still get
          // clickjacking protection from this.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Mic is needed by the LeadConnector voice agent, injected into
          // the top-level document (not an iframe) by
          // src/components/site/AgentWidget.tsx, and by the Web Speech API
          // in src/hooks/useCallCapture.tsx (the manual transcript-capture
          // UI, restored alongside the agent on the onboarding flow page).
          // Both need top-level permission. Everything else stays denied
          // by default.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;

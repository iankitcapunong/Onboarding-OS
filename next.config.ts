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

// The only third-party <script> this app loads (src/components/site/VoiceWidget.tsx)
// is the LeadConnector chat/voice widget — but its own runtime pulls in
// several more of its subdomains (services.* for its session/config API,
// stcdn.* for phone-input libraries) plus msgsndr.com (GoHighLevel's
// backend infra — a session-attribution call) and a third-party font CDN
// (fonts.bunny.net). All confirmed live by loading the page under this
// CSP and watching devtools for violations. Wildcarding each vendor's
// subdomains is simpler and more robust than enumerating each one, since
// it's a black-box widget that may add more without notice.
const LEADCONNECTOR_ORIGIN = "https://*.leadconnectorhq.com";
const MSGSNDR_ORIGIN = "https://*.msgsndr.com";
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
  `connect-src 'self' ${SUPABASE_URL} ${LEADCONNECTOR_ORIGIN} ${MSGSNDR_ORIGIN}`,
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
          // Mic is used first-party by the Web Speech API in
          // src/hooks/useCallCapture.tsx and by the LeadConnector widget
          // (injected into the top-level document, not an iframe, by
          // src/components/site/VoiceWidget.tsx) — both need top-level
          // permission. Everything else stays denied by default.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;

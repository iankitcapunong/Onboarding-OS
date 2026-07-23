import type { CreativeFields } from "@/lib/creativeBuilders";
import type { BribleSpec } from "@/lib/bribleEngine";

/* ============================================================
   BRIBLE — static UI content (chips, the inline visual-editor script,
   the "From the Community" remixable templates). Direct port of the
   hardcoded arrays/strings from js/app.js lines ~4028-4034 and
   ~5275-5319 — calibrated product copy/content, not logic, hence kept
   verbatim rather than "simplified". ============================================================ */

/* injected into the preview only while Edit mode is on: highlights the
   hovered element and reports the clicked one back to the app via
   postMessage. Copied verbatim from js/app.js's BRIBLE_EDIT_JS (lines
   ~4028-4034) — do not "clean up" the string-concatenation-split
   `<scr`+`ipt>` tags, they exist so this literal doesn't prematurely
   close the *outer* HTML document it gets spliced into. */
export const BRIBLE_EDIT_JS =
  "<scr" +
  "ipt>(function(){var hl=null;" +
  "document.addEventListener('mouseover',function(e){var t=e.target;if(!t||t===document.body||t===document.documentElement)return;" +
  "if(hl){hl.style.outline='';}hl=t;t.style.outline='2px solid #6366f1';t.style.outlineOffset='2px';t.style.cursor='pointer';});" +
  "document.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var t=e.target;" +
  "var tx=(t.innerText||t.textContent||'').replace(/\\s+/g,' ').trim();" +
  "parent.postMessage({brible:'select',tag:t.tagName.toLowerCase(),cls:t.className||'',text:tx.slice(0,160)},'*');},true);" +
  "})();</scr" +
  "ipt>";

/* builder chat quick-reply chips (#bribleChips) */
export const BRIBLE_CHIPS = ["Build my website", "Make it dark & premium", "Add pricing", "Add FAQ", "Full-width photo hero", "Surprise me"];

/* home prompt-box suggestion chips (#bribleHomeChips) */
export const BRIBLE_HOME_CHIPS = [
  "Build my website",
  "Dark & premium with pricing",
  "Warm and friendly, add FAQ",
  "Ocean style, full-width photo hero",
  "Editorial look with a gallery",
  "Build a lead-gen funnel with an opt-in and thank-you page",
  "Build a webinar funnel with registration and a sales page",
  "Build a sales funnel with a checkout page",
  "Surprise me",
];

export type BribleTemplate = {
  name: string;
  cat: string;
  remixes: number;
  ctx: CreativeFields;
  spec: BribleSpec;
};

export const BRIBLE_TAB_LIST = ["Popular", "Professional", "Real estate", "Health & fitness", "Food & drink", "Beauty & salon", "Home services"];

export const BRIBLE_TPLS: BribleTemplate[] = [
  {
    name: "Skyline Realty",
    cat: "Real estate",
    remixes: 1204,
    ctx: { business: "Skyline Realty", offer: "boutique home buying & selling", audience: "young families upgrading their first home", goal: "book more private viewings", voice: "confident and warm" },
    spec: { themeKey: "Noir", overlay: true, sections: { pricing: true }, overrides: {} },
  },
  {
    name: "Pulse Fitness",
    cat: "Health & fitness",
    remixes: 986,
    ctx: { business: "Pulse Fitness", offer: "a 12-week strength program", audience: "busy professionals who want to get strong", goal: "fill the next training cohort", voice: "energetic and motivating" },
    spec: { themeKey: "Neon Tech", overlay: true, sections: { gallery: true }, overrides: {} },
  },
  {
    name: "Bloom Dental",
    cat: "Health & fitness",
    remixes: 743,
    ctx: { business: "Bloom Dental", offer: "gentle family & cosmetic dentistry", audience: "families who put off the dentist", goal: "fill the appointment calendar", voice: "calm and reassuring" },
    spec: { themeKey: "Ocean", overlay: false, sections: { faq: true }, overrides: {} },
  },
  {
    name: "Summit Coaching",
    cat: "Professional",
    remixes: 1580,
    ctx: { business: "Summit Coaching", offer: "1:1 executive coaching", audience: "mid-career professionals stepping into leadership", goal: "book more discovery calls", voice: "warm, direct, encouraging" },
    spec: { themeKey: "Aurora", overlay: false, sections: { pricing: true, faq: true }, overrides: {} },
  },
  {
    name: "Harvest Table",
    cat: "Food & drink",
    remixes: 662,
    ctx: { business: "Harvest Table", offer: "seasonal farm-to-table dining", audience: "food lovers looking for something special", goal: "fill weekend reservations", voice: "rustic and inviting" },
    spec: { themeKey: "Editorial", overlay: true, sections: { gallery: true }, overrides: {} },
  },
  {
    name: "Nomad Studio",
    cat: "Professional",
    remixes: 891,
    ctx: { business: "Nomad Studio", offer: "brand & web design sprints", audience: "startups that need to look bigger than they are", goal: "land three retainer clients", voice: "bold and playful" },
    spec: { themeKey: "Sunset", overlay: false, sections: { gallery: true, pricing: true }, overrides: {} },
  },
  {
    name: "ClearBooks",
    cat: "Professional",
    remixes: 534,
    ctx: { business: "ClearBooks", offer: "bookkeeping & tax for small business", audience: "owners drowning in receipts", goal: "sign up monthly bookkeeping clients", voice: "plain-spoken and trustworthy" },
    spec: { themeKey: "Ocean", overlay: false, sections: { pricing: true, faq: true }, overrides: {} },
  },
  {
    name: "Luxe Interiors",
    cat: "Real estate",
    remixes: 1102,
    ctx: { business: "Luxe Interiors", offer: "full-service interior design", audience: "homeowners planning a renovation", goal: "book design consultations", voice: "refined and understated" },
    spec: { themeKey: "Noir", overlay: true, sections: { gallery: true }, overrides: {} },
  },
  {
    name: "Cascade Properties",
    cat: "Real estate",
    remixes: 478,
    ctx: { business: "Cascade Properties", offer: "commercial leasing & property management", audience: "small business owners looking for the right space", goal: "book a site tour", voice: "professional and straightforward" },
    spec: { themeKey: "Ocean", overlay: true, sections: { gallery: true }, overrides: {} },
  },
  {
    name: "Vital Physio",
    cat: "Health & fitness",
    remixes: 617,
    ctx: { business: "Vital Physio", offer: "sports injury physiotherapy", audience: "active adults recovering from injury", goal: "book an assessment", voice: "encouraging and clinical" },
    spec: { themeKey: "Aurora", overlay: false, sections: { faq: true }, overrides: {} },
  },
  {
    name: "Ledger & Law",
    cat: "Professional",
    remixes: 359,
    ctx: { business: "Ledger & Law", offer: "small business legal counsel", audience: "founders who need a lawyer on call", goal: "book a consultation", voice: "sharp and reassuring" },
    spec: { themeKey: "Noir", overlay: false, sections: { pricing: true, faq: true }, overrides: {} },
  },
  {
    name: "Craft & Cask",
    cat: "Food & drink",
    remixes: 821,
    ctx: { business: "Craft & Cask", offer: "small-batch craft brews & taproom nights", audience: "locals looking for their new regular spot", goal: "fill the taproom on weekends", voice: "casual and a little cheeky" },
    spec: { themeKey: "Sunset", overlay: true, sections: { gallery: true }, overrides: {} },
  },
  {
    name: "Willow & Co",
    cat: "Beauty & salon",
    remixes: 940,
    ctx: { business: "Willow & Co", offer: "hair color & styling", audience: "clients who want a stylist they trust", goal: "fill the weekly booking calendar", voice: "warm and on-trend" },
    spec: { themeKey: "Sunset", overlay: true, sections: { gallery: true, pricing: true }, overrides: {} },
  },
  {
    name: "Glow Aesthetics",
    cat: "Beauty & salon",
    remixes: 705,
    ctx: { business: "Glow Aesthetics", offer: "medical-grade facials & skin treatments", audience: "clients serious about their skincare", goal: "book a consultation", voice: "premium and calming" },
    spec: { themeKey: "Editorial", overlay: false, sections: { pricing: true, faq: true }, overrides: {} },
  },
  {
    name: "Vertex Roofing",
    cat: "Home services",
    remixes: 512,
    ctx: { business: "Vertex Roofing", offer: "roof repair & replacement", audience: "homeowners with storm or age damage", goal: "book a free inspection", voice: "no-nonsense and trustworthy" },
    spec: { themeKey: "Neon Tech", overlay: true, sections: { gallery: true, faq: true }, overrides: {} },
  },
  {
    name: "Coastal HVAC",
    cat: "Home services",
    remixes: 468,
    ctx: { business: "Coastal HVAC", offer: "AC install, repair & maintenance plans", audience: "homeowners tired of unreliable service calls", goal: "book same-week service", voice: "friendly and dependable" },
    spec: { themeKey: "Ocean", overlay: false, sections: { pricing: true, faq: true }, overrides: {} },
  },
];

"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/assistantTemplate";

type PublishedAssistant = {
  slug: string;
  assistant_id: string;
  name: string;
};

const COMING_SOON: { name: string; blurb: string; logo: ReactNode }[] = [
  {
    name: "Google Sheets",
    blurb: "Collected onboarding data lands in your own sheet, ready for the rest of your stack.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#188038" />
        <path d="M14 2v5h5z" fill="#8ED1B1" />
        <path d="M8 11h8v6.5H8z M8 14.25h8 M12 11v6.5" fill="none" stroke="#fff" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    name: "Zapier",
    blurb: "Trigger any of 6,000+ apps when an onboarding conversation finishes.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <path
          d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7"
          stroke="#FF4F00"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    name: "Make",
    blurb: "Design multi-step scenarios that run whenever onboarding wraps up.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <rect width="24" height="24" rx="5" fill="#6D00CC" />
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fontSize="12"
          fontWeight="800"
          fill="#fff"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          M
        </text>
      </svg>
    ),
  },
  {
    name: "GoHighLevel / CRM",
    blurb: "Push new contacts and their answers straight into your CRM pipeline.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <rect width="24" height="24" rx="5" fill="#0B5CFF" />
        <path d="M7 17.5v-3.5M12 17.5v-7M17 17.5V6.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "HubSpot",
    blurb: "Sync new contacts and their answers into HubSpot properties.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <circle cx="14" cy="13.5" r="4.6" fill="none" stroke="#FF7A59" strokeWidth="2.6" />
        <path d="M14 8.9V5.6M10.7 17L6.8 20.6" stroke="#FF7A59" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="14" cy="4.6" r="1.9" fill="#FF7A59" />
        <circle cx="6.2" cy="21" r="1.5" fill="#FF7A59" />
      </svg>
    ),
  },
  {
    name: "Salesforce",
    blurb: "Create leads and log onboarding activity in Salesforce automatically.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <path
          d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
          fill="#00A1E0"
        />
      </svg>
    ),
  },
  {
    name: "Slack",
    blurb: "Get a message in your channel the moment a client finishes onboarding.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <path
          d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
          fill="#E01E5A"
        />
        <path
          d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
          fill="#36C5F0"
        />
        <path
          d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
          fill="#2EB67D"
        />
        <path
          d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
          fill="#ECB22E"
        />
      </svg>
    ),
  },
  {
    name: "Gmail",
    blurb: "Auto-send a recap email to you and your client after each session.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <rect x="2.5" y="5" width="19" height="14" rx="2" fill="#fff" />
        <path d="M4.5 8l7.5 5.2L19.5 8" fill="none" stroke="#EA4335" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Notion",
    blurb: "Drop transcripts and structured answers into your Notion workspace.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <rect x="3.5" y="3" width="17" height="18" rx="2.5" fill="#fff" stroke="#37352F" strokeWidth="1.4" />
        <path
          d="M8.8 16.5V8l6.6 8.5V8"
          fill="none"
          stroke="#37352F"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "Airtable",
    blurb: "Route responses into an Airtable base to power the rest of your ops.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <path d="M11.3 3.3L3 6.6l9 3.6 9-3.6-8.3-3.3a2 2 0 0 0-1.4 0z" fill="#FCB400" />
        <path d="M12.8 11.8v8.9l8.2-3.3V8.5z" fill="#18BFFF" />
        <path d="M11.2 11.8L3 8.5v8.9l8.2 3.3z" fill="#F82B60" />
      </svg>
    ),
  },
  {
    name: "Calendly",
    blurb: "Let clients book their kickoff call right inside the conversation.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <path d="M17.4 16.2A6.8 6.8 0 1 1 17.4 7.8" fill="none" stroke="#006BFF" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Stripe",
    blurb: "Kick off onboarding automatically after a successful payment.",
    logo: (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        <rect width="24" height="24" rx="5" fill="#635BFF" />
        <path
          transform="translate(4.8 4.8) scale(0.6)"
          d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"
          fill="#fff"
        />
      </svg>
    ),
  },
];

export default function IntegrationsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [supabase] = useState(() => createClient());
  const [published, setPublished] = useState<PublishedAssistant[] | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("agent_deployments")
      .select("slug, assistant_id, assistants(name)")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast(error.message);
          setPublished([]);
          return;
        }
        setPublished(
          ((data ?? []) as unknown as { slug: string; assistant_id: string; assistants: { name: string } | null }[]).map(
            (d) => ({ slug: d.slug, assistant_id: d.assistant_id, name: d.assistants?.name ?? "Assistant" })
          )
        );
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase, toast]);

  function copy(text: string, label: string) {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    toast(`${label} copied`, true);
  }

  // Unpublishes the assistant: deletes its deployment row, so the public
  // link (and any embeds using it) stop working immediately. The draft
  // survives — re-publishing from the editor mints a new link.
  async function handleRemove(p: PublishedAssistant) {
    const ok = confirm(
      `Remove the chat link for "${p.name}"? /talk/${p.slug} and any embeds of it stop working immediately. The assistant itself is kept — publishing again creates a new link.`
    );
    if (!ok) return;
    try {
      const { error } = await supabase
        .from("agent_deployments")
        .delete()
        .eq("assistant_id", p.assistant_id);
      if (error) throw error;
      setPublished((prev) => (prev ?? []).filter((x) => x.assistant_id !== p.assistant_id));
      toast("Chat link removed", true);
    } catch (err) {
      toast(errorMessage(err, "Couldn't remove the link"));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Integrations</h2>
          <p className="page-sub">
            Put your onboarding agent wherever your clients already are — share the link, embed the chat,
            or wire the results into your own systems.
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <h3>Chat links &amp; embeds</h3>
        {published === null ? (
          <p className="panel-sub">Loading…</p>
        ) : published.length === 0 ? (
          <p className="panel-sub">
            No published assistants yet — publish one from the{" "}
            <Link href="/app/assistants">Assistants</Link> tab to get a shareable link.
          </p>
        ) : (
          published.map((p) => {
            const link = `${origin}/talk/${p.slug}`;
            const embed = `<iframe src="${link}" style="width:100%;height:640px;border:0;border-radius:12px" title="${p.name}"></iframe>`;
            return (
              <div key={p.slug} style={{ padding: "14px 0", borderTop: "1px solid var(--border)" }}>
                <strong>{p.name}</strong>
                <div className="field" style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 220 }} />
                  <button type="button" className="btn btn-secondary" onClick={() => copy(link, "Link")}>
                    Copy link
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => copy(embed, "Embed code")}>
                    Copy embed
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => handleRemove(p)}>
                    Remove
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 6 }}>
                  The embed drops the same chat into any page of your site.
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <h3>Webhooks</h3>
        <p className="panel-sub">
          Every finished conversation can POST its transcript to your endpoint — Zapier, n8n, or your own
          server. Set that up on the <Link href="/app/tools">Tools</Link> tab.
        </p>
      </div>

      <div className="panel">
        <h3>Native integrations</h3>
        <p className="panel-sub">Coming soon — tell us which one you need first.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
          {COMING_SOON.map((c) => (
            <div key={c.name} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  aria-hidden
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 9,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--border)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {c.logo}
                </span>
                <strong style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {c.name}
                  <span className="side-badge side-badge-admin">Soon</span>
                </strong>
              </div>
              <p className="panel-sub" style={{ margin: "8px 0 0", fontSize: 13.5 }}>{c.blurb}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

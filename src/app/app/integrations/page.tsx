"use client";

import { useEffect, useState } from "react";
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

const COMING_SOON = [
  {
    name: "Google Sheets",
    blurb: "Collected onboarding data lands in your own sheet, ready for the rest of your stack.",
  },
  {
    name: "Zapier",
    blurb: "Trigger any of 6,000+ apps when an onboarding conversation finishes.",
  },
  {
    name: "GoHighLevel / CRM",
    blurb: "Push new contacts and their answers straight into your CRM pipeline.",
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
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {c.name}
                <span className="side-badge side-badge-admin">Soon</span>
              </strong>
              <p className="panel-sub" style={{ margin: "6px 0 0", fontSize: 13.5 }}>{c.blurb}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

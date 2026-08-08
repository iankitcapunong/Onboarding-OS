"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/assistantTemplate";
import { copyTable, downloadCsv } from "@/lib/csv";

type ToolRow = {
  id: string;
  assistant_id: string | null;
  type: "webhook";
  name: string;
  config: { url?: string; secret?: string; events?: string[] };
  enabled: boolean;
  created_at: string;
};

type AssistantOption = { id: string; name: string };

const EXAMPLE_PAYLOAD = `{
  "event": "session.ended",
  "sessionId": "…",
  "slug": "…",
  "assistantId": "…",
  "assistantName": "Onboarding agent",
  "startedAt": "2026-07-30T12:00:00Z",
  "endedAt": "2026-07-30T12:06:40Z",
  "messageCount": 12,
  "contact": { "name": "…", "email": "…", "phone": "…", "company": "…" },
  "answers": { "business": "…", "main_offer": "…", "location": "…" },
  "summary": "2-3 plain sentences about who this is and what they want.",
  "transcript": [
    { "role": "assistant", "content": "…", "created_at": "…" },
    { "role": "user", "content": "…", "created_at": "…" }
  ]
}`;

function validWebhookUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || /^127\.|^10\.|^192\.168\.|^169\.254\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export default function ToolsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [supabase] = useState(() => createClient());
  const [tools, setTools] = useState<ToolRow[] | null>(null);
  const [assistants, setAssistants] = useState<AssistantOption[]>([]);
  const [busy, setBusy] = useState(false);

  // New-webhook form
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("Webhook");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState("all");
  /* Which row currently has its signing secret on screen. Secrets are
     owner-readable by design (migration 0008) and already travel with
     the list query, so revealing one is a disclosure, not a one-time
     ceremony — a newly created webhook just starts revealed. */
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("assistant_tools")
      .select("id, assistant_id, type, name, config, enabled, created_at")
      // Native destinations (zapier/ghl/sheets) share this table but are
      // managed on the Integrations tab — this page is webhooks only.
      .eq("type", "webhook")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast(error.message);
          setTools([]);
          return;
        }
        setTools((data ?? []) as ToolRow[]);
      });
    supabase
      .from("assistants")
      .select("id, name")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setAssistants((data ?? []) as AssistantOption[]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase, toast]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    const trimmedUrl = url.trim();
    if (!validWebhookUrl(trimmedUrl)) {
      toast("Enter a public https:// URL");
      return;
    }
    setBusy(true);
    try {
      const secret = crypto.randomUUID().replace(/-/g, "");
      const { data, error } = await supabase
        .from("assistant_tools")
        .insert({
          user_id: user.id,
          assistant_id: scope === "all" ? null : scope,
          type: "webhook",
          name: name.trim() || "Webhook",
          config: { url: trimmedUrl, secret, events: ["session.ended"] },
        })
        .select("id, assistant_id, type, name, config, enabled, created_at")
        .single();
      if (error) throw error;
      setTools((prev) => [...(prev ?? []), data as ToolRow]);
      setRevealedId((data as ToolRow).id);
      setFormOpen(false);
      setName("Webhook");
      setUrl("");
      setScope("all");
      toast("Webhook added", true);
    } catch (err) {
      const message = errorMessage(err, "Couldn't add the webhook");
      toast(
        message.includes("tool_limit_reached")
          ? "You've reached the 20-destination limit — remove one you no longer use first."
          : message
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(tool: ToolRow) {
    const { error } = await supabase
      .from("assistant_tools")
      .update({ enabled: !tool.enabled, updated_at: new Date().toISOString() })
      .eq("id", tool.id);
    if (error) {
      toast(error.message);
      return;
    }
    setTools((prev) => (prev ?? []).map((t) => (t.id === tool.id ? { ...t, enabled: !t.enabled } : t)));
  }

  async function handleDelete(tool: ToolRow) {
    if (!confirm(`Delete "${tool.name}"?`)) return;
    const { error } = await supabase.from("assistant_tools").delete().eq("id", tool.id);
    if (error) {
      toast(error.message);
      return;
    }
    setTools((prev) => (prev ?? []).filter((t) => t.id !== tool.id));
    toast("Webhook deleted", true);
  }

  function scopeLabel(tool: ToolRow): string {
    if (!tool.assistant_id) return "All assistants";
    return assistants.find((a) => a.id === tool.assistant_id)?.name ?? "Deleted assistant";
  }

  // Signing secrets are deliberately left out of the export.
  function exportRows(): string[][] {
    return [
      ["Name", "Endpoint URL", "Fires for", "Events", "Status", "Created"],
      ...(tools ?? []).map((t) => [
        t.name,
        t.config.url || "",
        scopeLabel(t),
        (t.config.events || []).join(", "),
        t.enabled ? "On" : "Off",
        new Date(t.created_at).toLocaleString(),
      ]),
    ];
  }

  function handleDownloadCsv() {
    if (!tools?.length) return;
    downloadCsv(exportRows(), `webhooks-${new Date().toISOString().slice(0, 10)}.csv`);
    toast("CSV downloaded", true);
  }

  async function copySecret(tool: ToolRow) {
    const secret = tool.config.secret;
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast("Signing secret copied", true);
    } catch {
      // Clipboard is blocked outside a secure context / without permission —
      // the field is selectable, so say that rather than failing silently.
      toast("Couldn't copy — select the secret and copy it manually");
    }
  }

  async function handleCopyTable() {
    if (!tools?.length) return;
    if (await copyTable(exportRows())) toast("Copied to clipboard — paste straight into a spreadsheet", true);
    else toast("Couldn't copy. Try Download CSV instead");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Tools</h2>
          <p className="page-sub">
            Connect your own systems. When an onboarding chat ends, we POST the extracted contact,
            answers, and full transcript to your webhook — point it at n8n or your own endpoint.
            Native GoHighLevel, Google Sheets, and Zapier live on the Integrations tab.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(tools?.length ?? 0) > 0 && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyTable}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
                Copy
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownloadCsv}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                Download CSV
              </button>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
            <span className="btn-label">{formOpen ? "Cancel" : "Add webhook"}</span>
          </button>
        </div>
      </div>

      {formOpen && (
        <form className="panel" style={{ marginBottom: 14 }} onSubmit={handleCreate}>
          <h3>New webhook</h3>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="toolName">Name</label>
            <input id="toolName" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CRM sync" />
          </div>
          <div className="field">
            <label htmlFor="toolUrl">Endpoint URL</label>
            <input
              id="toolUrl"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.example.com/onboarding"
              required
            />
            <p className="hint">https:// only — private/local addresses are rejected.</p>
          </div>
          <div className="field">
            <label htmlFor="toolScope">Fires for</label>
            <select id="toolScope" className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">All assistants</option>
              {assistants.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <span className="btn-label">{busy ? "Adding…" : "Add webhook"}</span>
          </button>
        </form>
      )}

      {tools === null ? (
        <div className="panel">
          <p className="panel-sub">Loading…</p>
        </div>
      ) : tools.length === 0 && !formOpen ? (
        <div className="panel">
          <h3>No tools yet</h3>
          <p className="panel-sub">
            Add a webhook and every finished onboarding conversation lands in your own system
            automatically — nothing to reconnect by hand.
          </p>
        </div>
      ) : (
        tools.map((tool) => (
          <div className="panel" key={tool.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 220 }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {tool.name}
                  <span className={`side-badge${tool.enabled ? "" : " side-badge-admin"}`}>
                    {tool.enabled ? "On" : "Off"}
                  </span>
                </h3>
                <p className="panel-sub" style={{ margin: "4px 0 0", wordBreak: "break-all" }}>
                  {tool.config.url} · {scopeLabel(tool)} · session.ended
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleToggle(tool)}>
                  {tool.enabled ? "Disable" : "Enable"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDelete(tool)}>
                  Delete
                </button>
              </div>
            </div>

            {tool.config.secret && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  aria-expanded={revealedId === tool.id}
                  onClick={() => setRevealedId(revealedId === tool.id ? null : tool.id)}
                >
                  {revealedId === tool.id ? "Hide signing secret" : "Reveal signing secret"}
                </button>
                {revealedId === tool.id && (
                  <>
                    <div className="field" style={{ display: "flex", gap: 8, margin: "10px 0 0" }}>
                      <input
                        className="input"
                        readOnly
                        aria-label={`Signing secret for ${tool.name}`}
                        value={tool.config.secret}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => copySecret(tool)}
                      >
                        Copy
                      </button>
                    </div>
                    <p className="hint" style={{ marginTop: 6 }}>
                      Every delivery is signed with this — header <code>X-BSL-Signature</code>, hex
                      HMAC-SHA256 of the raw body. Keep it out of anything public; it&rsquo;s how your
                      endpoint knows the POST is really us.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        ))
      )}

      <div className="panel" style={{ marginTop: 6 }}>
        <h3>What gets delivered</h3>
        <p className="panel-sub">
          One POST per finished conversation. Verify it&rsquo;s really us by recomputing the
          <code> X-BSL-Signature</code> header (hex HMAC-SHA256 of the raw body with your secret).
          Manage your public chat links on the <Link href="/app/integrations">Integrations</Link> tab.
        </p>
        <pre
          className="pp-mono"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 12.5, overflowX: "auto", marginTop: 10 }}
        >
          {EXAMPLE_PAYLOAD}
        </pre>
      </div>
    </>
  );
}

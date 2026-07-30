"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";

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
  "startedAt": "2026-07-30T12:00:00Z",
  "endedAt": "2026-07-30T12:06:40Z",
  "messageCount": 12,
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
  // Shown exactly once, right after creation.
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("assistant_tools")
      .select("id, assistant_id, type, name, config, enabled, created_at")
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
      setFreshSecret(secret);
      setFormOpen(false);
      setName("Webhook");
      setUrl("");
      setScope("all");
      toast("Webhook added", true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't add the webhook");
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

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Tools</h2>
          <p className="page-sub">
            Connect your own systems. When an onboarding chat ends, we POST the full transcript to your
            webhook — point it at Zapier, n8n, or your own endpoint.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
          <span className="btn-label">{formOpen ? "Cancel" : "Add webhook"}</span>
        </button>
      </div>

      {freshSecret && (
        <div className="panel" style={{ marginBottom: 14, borderColor: "var(--primary)" }}>
          <h3>Copy your signing secret now</h3>
          <p className="panel-sub">
            It&rsquo;s shown only this once. Each delivery is signed with it —
            header <code>X-BSL-Signature</code>, hex HMAC-SHA256 of the raw body.
          </p>
          <div className="field" style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input className="input" readOnly value={freshSecret} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (navigator.clipboard) navigator.clipboard.writeText(freshSecret);
                toast("Secret copied", true);
              }}
            >
              Copy
            </button>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setFreshSecret(null)}>
            I&rsquo;ve saved it
          </button>
        </div>
      )}

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

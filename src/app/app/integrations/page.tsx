"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callIntegrationTest } from "@/lib/edgeFunctions";
import { errorMessage } from "@/lib/assistantTemplate";

type PublishedAssistant = {
  slug: string;
  assistant_id: string;
  name: string;
};

type ToolType = "webhook" | "zapier" | "ghl" | "sheets";

type ToolRow = {
  id: string;
  assistant_id: string | null;
  type: ToolType;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  type: string;
  tool_name: string;
  event: string;
  ok: boolean;
  status_code: number | null;
  detail: string;
  created_at: string;
};

type AssistantOption = { id: string; name: string };

const TYPE_LABELS: Record<ToolType, string> = {
  webhook: "Webhook",
  zapier: "Zapier",
  ghl: "GoHighLevel",
  sheets: "Google Sheets",
};

// Optional deploy-time hint: the service-account email clients must
// share their spreadsheet with (mirrors the server's GOOGLE_SA_EMAIL).
const SHEETS_SA_EMAIL = process.env.NEXT_PUBLIC_SHEETS_SA_EMAIL || "";

// Accepts a bare spreadsheet id or a full docs.google.com URL.
function parseSpreadsheetId(raw: string): string {
  const match = raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match) return match[1];
  return raw.trim();
}

function validHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

// One-line "where does this go" summary for the destination list.
function targetSummary(tool: ToolRow): string {
  const config = tool.config ?? {};
  switch (tool.type) {
    case "webhook":
    case "zapier":
      return String(config.url ?? "");
    case "ghl": {
      const loc = String(config.locationId ?? "");
      const pipeline = String(config.pipelineId ?? "");
      return `location ${loc}${pipeline ? " · pipeline " + pipeline : " · contacts only"}`;
    }
    case "sheets":
      return `sheet ${String(config.spreadsheetId ?? "")} · tab ${String(config.sheetName || "Sheet1")}`;
  }
}

const COMING_SOON: { name: string; blurb: string; logo: ReactNode }[] = [
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

  const [tools, setTools] = useState<ToolRow[] | null>(null);
  const [assistants, setAssistants] = useState<AssistantOption[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // One connect form open at a time.
  const [formType, setFormType] = useState<Exclude<ToolType, "webhook"> | null>(null);
  const [formName, setFormName] = useState("");
  const [formScope, setFormScope] = useState("all");
  const [formUrl, setFormUrl] = useState("");
  const [formToken, setFormToken] = useState("");
  const [formLocationId, setFormLocationId] = useState("");
  const [formPipelineId, setFormPipelineId] = useState("");
  const [formStageId, setFormStageId] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formSheet, setFormSheet] = useState("");
  const [formSheetName, setFormSheetName] = useState("Sheet1");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const deliveriesQuery = useCallback(
    () =>
      supabase
        .from("integration_deliveries")
        .select("id, type, tool_name, event, ok, status_code, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    [supabase]
  );

  async function loadDeliveries() {
    const { data } = await deliveriesQuery();
    setDeliveries((data ?? []) as DeliveryRow[]);
  }

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
    deliveriesQuery().then(({ data }) => {
      if (!cancelled) setDeliveries((data ?? []) as DeliveryRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [user, supabase, toast, deliveriesQuery]);

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

  function openForm(type: Exclude<ToolType, "webhook">) {
    setFormType((current) => (current === type ? null : type));
    setFormName(TYPE_LABELS[type]);
    setFormScope("all");
    setFormUrl("");
    setFormToken("");
    setFormLocationId("");
    setFormPipelineId("");
    setFormStageId("");
    setFormTags("");
    setFormSheet("");
    setFormSheetName("Sheet1");
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !formType || busy) return;

    let config: Record<string, unknown>;
    if (formType === "zapier") {
      const url = formUrl.trim();
      if (!validHttpsUrl(url)) {
        toast("Paste your Zap's https:// catch-hook URL");
        return;
      }
      config = { url };
    } else if (formType === "ghl") {
      const token = formToken.trim();
      const locationId = formLocationId.trim();
      if (!token || !locationId) {
        toast("A Private Integration token and Location ID are both required");
        return;
      }
      const pipelineId = formPipelineId.trim();
      const stageId = formStageId.trim();
      if ((pipelineId && !stageId) || (!pipelineId && stageId)) {
        toast("To open pipeline opportunities, fill in BOTH pipeline and stage IDs (or neither)");
        return;
      }
      const tags = formTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      config = { token, locationId };
      if (pipelineId && stageId) {
        config.pipelineId = pipelineId;
        config.stageId = stageId;
      }
      if (tags.length > 0) config.tags = tags;
    } else {
      const spreadsheetId = parseSpreadsheetId(formSheet);
      if (!spreadsheetId) {
        toast("Paste your spreadsheet's URL or ID");
        return;
      }
      config = { spreadsheetId, sheetName: formSheetName.trim() || "Sheet1" };
    }

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("assistant_tools")
        .insert({
          user_id: user.id,
          assistant_id: formScope === "all" ? null : formScope,
          type: formType,
          name: formName.trim() || TYPE_LABELS[formType],
          config,
        })
        .select("id, assistant_id, type, name, config, enabled, created_at")
        .single();
      if (error) throw error;
      setTools((prev) => [...(prev ?? []), data as ToolRow]);
      setFormType(null);
      toast(`${TYPE_LABELS[formType]} connected — hit "Send test" to confirm delivery`, true);
    } catch (err) {
      const message = errorMessage(err, "Couldn't connect the destination");
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
    if (!confirm(`Delete "${tool.name}"? New conversations stop delivering to it immediately.`)) return;
    const { error } = await supabase.from("assistant_tools").delete().eq("id", tool.id);
    if (error) {
      toast(error.message);
      return;
    }
    setTools((prev) => (prev ?? []).filter((t) => t.id !== tool.id));
    toast("Destination deleted", true);
  }

  async function handleTest(tool: ToolRow) {
    if (testingId) return;
    setTestingId(tool.id);
    try {
      const result = await callIntegrationTest(supabase, tool.id);
      toast(result.ok ? `Test delivered — ${result.detail}` : `Test failed — ${result.detail}`, result.ok);
    } catch (err) {
      toast(errorMessage(err, "Couldn't send the test"));
    } finally {
      setTestingId(null);
      loadDeliveries();
    }
  }

  function scopeLabel(tool: ToolRow): string {
    if (!tool.assistant_id) return "All assistants";
    return assistants.find((a) => a.id === tool.assistant_id)?.name ?? "Deleted assistant";
  }

  const scopeSelect = (
    <div className="field">
      <label htmlFor="destScope">Fires for</label>
      <select id="destScope" className="input" value={formScope} onChange={(e) => setFormScope(e.target.value)}>
        <option value="all">All assistants</option>
        {assistants.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Integrations</h2>
          <p className="page-sub">
            Put your onboarding agent wherever your clients already are — and when a conversation ends,
            the contact details and answers it collected land in your own systems automatically.
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
        <h3>Where collected data goes</h3>
        <p className="panel-sub">
          When a conversation ends we extract the contact and their answers, then deliver to every
          destination below. Webhooks (signed, for your own server or n8n) are managed on the{" "}
          <Link href="/app/tools">Tools</Link> tab.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openForm("ghl")}>
            {formType === "ghl" ? "Cancel" : "Connect GoHighLevel"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openForm("sheets")}>
            {formType === "sheets" ? "Cancel" : "Connect Google Sheets"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openForm("zapier")}>
            {formType === "zapier" ? "Cancel" : "Connect Zapier"}
          </button>
        </div>

        {formType === "ghl" && (
          <form onSubmit={handleConnect} style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <h3 style={{ fontSize: 15 }}>Connect GoHighLevel</h3>
            <p className="panel-sub">
              Each finished conversation upserts the contact into your GHL location, attaches the
              answers as a note, and (optionally) opens an opportunity in your pipeline. Create a{" "}
              Private Integration token under Settings → Private Integrations in your GHL sub-account
              (scopes: contacts and opportunities).
            </p>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="ghlName">Name</label>
              <input id="ghlName" className="input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Main CRM" />
            </div>
            <div className="field">
              <label htmlFor="ghlToken">Private Integration token</label>
              <input id="ghlToken" className="input" value={formToken} onChange={(e) => setFormToken(e.target.value)} placeholder="pit-…" required />
              <p className="hint">Stored on your account and used only server-side to deliver your own data.</p>
            </div>
            <div className="field">
              <label htmlFor="ghlLocation">Location ID</label>
              <input id="ghlLocation" className="input" value={formLocationId} onChange={(e) => setFormLocationId(e.target.value)} placeholder="e.g. ve9EPM428h8vShlRW1KT" required />
            </div>
            <div className="field">
              <label htmlFor="ghlPipeline">Pipeline ID (optional)</label>
              <input id="ghlPipeline" className="input" value={formPipelineId} onChange={(e) => setFormPipelineId(e.target.value)} placeholder="leave empty to only create contacts" />
            </div>
            <div className="field">
              <label htmlFor="ghlStage">Pipeline stage ID (optional)</label>
              <input id="ghlStage" className="input" value={formStageId} onChange={(e) => setFormStageId(e.target.value)} placeholder="the stage new opportunities land in" />
            </div>
            <div className="field">
              <label htmlFor="ghlTags">Tags (optional, comma-separated)</label>
              <input id="ghlTags" className="input" value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="e.g. bsl-onboarding, new-lead" />
            </div>
            {scopeSelect}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <span className="btn-label">{busy ? "Connecting…" : "Connect GoHighLevel"}</span>
            </button>
          </form>
        )}

        {formType === "sheets" && (
          <form onSubmit={handleConnect} style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <h3 style={{ fontSize: 15 }}>Connect Google Sheets</h3>
            <p className="panel-sub">
              Each finished conversation appends one row: time, assistant, contact name/email/phone/company,
              summary, and every answer.
            </p>
            <p className="panel-sub" style={{ marginTop: 6 }}>
              One step first: in your sheet click <strong>Share</strong>, set &ldquo;General access&rdquo; to{" "}
              <strong>Anyone with the link → Editor</strong>, then paste the sheet&rsquo;s URL below.
              Note this makes the sheet open to anyone who has its link.
              {SHEETS_SA_EMAIL
                ? ` Prefer to keep it private? Share it (Editor access) with ${SHEETS_SA_EMAIL} instead.`
                : " Prefer to keep it private? Share it (Editor access) with our service-account email instead — it's shown in the delivery log if an append is rejected."}
            </p>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="sheetName">Name</label>
              <input id="sheetName" className="input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Onboarding sheet" />
            </div>
            <div className="field">
              <label htmlFor="sheetId">Spreadsheet URL or ID</label>
              <input id="sheetId" className="input" value={formSheet} onChange={(e) => setFormSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" required />
            </div>
            <div className="field">
              <label htmlFor="sheetTab">Tab name</label>
              <input id="sheetTab" className="input" value={formSheetName} onChange={(e) => setFormSheetName(e.target.value)} placeholder="Sheet1" />
            </div>
            {scopeSelect}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <span className="btn-label">{busy ? "Connecting…" : "Connect Google Sheets"}</span>
            </button>
          </form>
        )}

        {formType === "zapier" && (
          <form onSubmit={handleConnect} style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <h3 style={{ fontSize: 15 }}>Connect Zapier</h3>
            <p className="panel-sub">
              In Zapier, create a Zap with the &ldquo;Webhooks by Zapier → Catch Hook&rdquo; trigger and paste its
              URL here — every finished conversation triggers it with the contact, answers, summary, and
              transcript, ready to map into 6,000+ apps.
            </p>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="zapName">Name</label>
              <input id="zapName" className="input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. New client Zap" />
            </div>
            <div className="field">
              <label htmlFor="zapUrl">Catch-hook URL</label>
              <input id="zapUrl" className="input" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" required />
            </div>
            {scopeSelect}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <span className="btn-label">{busy ? "Connecting…" : "Connect Zapier"}</span>
            </button>
          </form>
        )}

        {tools === null ? (
          <p className="panel-sub" style={{ marginTop: 14 }}>Loading destinations…</p>
        ) : tools.length === 0 ? (
          <p className="panel-sub" style={{ marginTop: 14 }}>
            No destinations yet — connect one above and every finished conversation lands in it
            automatically.
          </p>
        ) : (
          tools.map((tool) => (
            <div key={tool.id} style={{ padding: "14px 0", borderTop: "1px solid var(--border)", marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 220 }}>
                  <strong style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {tool.name}
                    <span className="side-badge">{TYPE_LABELS[tool.type]}</span>
                    <span className={`side-badge${tool.enabled ? "" : " side-badge-admin"}`}>
                      {tool.enabled ? "On" : "Off"}
                    </span>
                  </strong>
                  <p className="panel-sub" style={{ margin: "4px 0 0", wordBreak: "break-all" }}>
                    {targetSummary(tool)} · {scopeLabel(tool)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleTest(tool)}
                    disabled={testingId !== null}
                  >
                    {testingId === tool.id ? "Sending…" : "Send test"}
                  </button>
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
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h3>Recent deliveries</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadDeliveries}>
            Refresh
          </button>
        </div>
        <p className="panel-sub">
          Every attempted delivery — real conversations and test sends — with exactly what happened.
          This is your proof the data landed.
        </p>
        {deliveries === null ? (
          <p className="panel-sub" style={{ marginTop: 10 }}>Loading…</p>
        ) : deliveries.length === 0 ? (
          <p className="panel-sub" style={{ marginTop: 10 }}>
            Nothing delivered yet — connect a destination and hit &ldquo;Send test&rdquo;.
          </p>
        ) : (
          deliveries.map((d) => (
            <div key={d.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border)", marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={`side-badge${d.ok ? "" : " side-badge-admin"}`}>{d.ok ? "Delivered" : "Failed"}</span>
                <strong style={{ fontSize: 13.5 }}>{d.tool_name || TYPE_LABELS[d.type as ToolType] || d.type}</strong>
                <span className="panel-sub" style={{ margin: 0, fontSize: 12.5 }}>
                  {d.event} · {new Date(d.created_at).toLocaleString()}
                </span>
              </div>
              <p className="panel-sub" style={{ margin: "4px 0 0", fontSize: 12.5, wordBreak: "break-word" }}>
                {d.detail}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <h3>More native integrations</h3>
        <p className="panel-sub">Coming soon — tell us which one you need first. (Most already work today through Zapier or a webhook.)</p>
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

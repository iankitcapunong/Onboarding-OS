"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { getJSON, removeJSON, scopedKey } from "@/lib/storage";
import { ASSISTANT_LIMITS } from "@/lib/featureGating";
import {
  AssistantRow,
  DeploymentRow,
  DEFAULT_ASSISTANT,
  ASSISTANT_TEMPLATES,
  applyIndustry,
  errorMessage,
  stripVoiceBlock,
} from "@/lib/assistantTemplate";

type LegacyPlaygroundState = { persona?: string; voice?: string; prompt?: string };

export default function AssistantsPage() {
  const { user } = useAuth();
  const { isAdmin, planKey } = useFeatureGating();
  const toast = useToast();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [assistants, setAssistants] = useState<AssistantRow[] | null>(null);
  const [deployments, setDeployments] = useState<Record<string, DeploymentRow>>({});
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedId, setPickedId] = useState(ASSISTANT_TEMPLATES[0].id);
  const [industry, setIndustry] = useState(ASSISTANT_TEMPLATES[0].defaultIndustry);

  useEffect(() => {
    if (!pickerOpen) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [pickerOpen]);

  const assistantLimit = ASSISTANT_LIMITS[planKey];

  // Optimistic pre-check only — the enforce_assistant_limit() DB
  // trigger is the real gate. Both surface the same upgrade message.
  function atAssistantCap(): boolean {
    if (isAdmin || assistants === null) return false;
    if (assistants.length < assistantLimit) return false;
    toast(
      planKey === "pro"
        ? `Your plan allows up to ${assistantLimit} assistants — delete one you no longer use first.`
        : `The free trial allows ${assistantLimit} assistants — upgrade to Pro for up to ${ASSISTANT_LIMITS.pro}.`
    );
    return true;
  }

  function capErrorMessage(err: unknown, fallback: string): string {
    const message = errorMessage(err, fallback);
    if (!message.includes("assistant_limit_reached")) return message;
    return planKey === "pro"
      ? `Your plan allows up to ${assistantLimit} assistants — delete one you no longer use first.`
      : `The free trial allows ${assistantLimit} assistants — upgrade to Pro for up to ${ASSISTANT_LIMITS.pro}.`;
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      const { data: rows, error } = await supabase
        .from("assistants")
        .select("id, name, first_message, persona, prompt, voice, model, created_at, updated_at")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast(error.message);
        setAssistants([]);
        return;
      }

      let list = (rows ?? []) as AssistantRow[];

      // One-time migration: accounts that only ever used the old
      // Playground have their draft in localStorage and no rows here
      // (accounts that DEPLOYED were backfilled by migration 0006).
      // The legacy key must be cleared once the account has rows —
      // otherwise deleting your last assistant resurrects it on reload.
      const legacyKey = scopedKey("bsl_playground", user?.email || "guest");
      if (list.length === 0) {
        const legacy = getJSON<LegacyPlaygroundState>(legacyKey);
        if (legacy?.persona || legacy?.prompt) {
          const { data: created } = await supabase
            .from("assistants")
            .insert({
              user_id: user!.id,
              name: DEFAULT_ASSISTANT.name,
              first_message: DEFAULT_ASSISTANT.first_message,
              persona: legacy.persona ?? DEFAULT_ASSISTANT.persona,
              prompt: stripVoiceBlock(legacy.prompt ?? DEFAULT_ASSISTANT.prompt),
              voice: legacy.voice ?? DEFAULT_ASSISTANT.voice,
            })
            .select("id, name, first_message, persona, prompt, voice, model, created_at, updated_at")
            .single();
          if (created) {
            list = [created as AssistantRow];
            removeJSON(legacyKey);
          }
        }
      } else {
        removeJSON(legacyKey);
      }

      if (cancelled) return;
      setAssistants(list);

      if (list.length > 0) {
        const { data: deps } = await supabase
          .from("agent_deployments")
          .select("id, assistant_id, slug, updated_at");
        if (cancelled) return;
        const map: Record<string, DeploymentRow> = {};
        (deps ?? []).forEach((d) => {
          map[(d as DeploymentRow).assistant_id] = d as DeploymentRow;
        });
        setDeployments(map);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, supabase, toast]);

  function openPicker() {
    if (busy || atAssistantCap()) return;
    setPickedId(ASSISTANT_TEMPLATES[0].id);
    setIndustry(ASSISTANT_TEMPLATES[0].defaultIndustry);
    setPickerOpen(true);
  }

  async function handleNew() {
    const tpl = ASSISTANT_TEMPLATES.find((t) => t.id === pickedId) ?? ASSISTANT_TEMPLATES[0];
    if (!user || busy || atAssistantCap()) return;
    setBusy(true);
    try {
      const filled = applyIndustry(tpl, industry);
      const { data, error } = await supabase
        .from("assistants")
        .insert({
          user_id: user.id,
          name: "Untitled assistant",
          first_message: filled.first_message,
          persona: filled.persona,
          prompt: filled.prompt,
          voice: filled.voice,
        })
        .select("id")
        .single();
      if (error) throw error;
      router.push(`/app/assistants/${(data as { id: string }).id}`);
    } catch (err) {
      toast(capErrorMessage(err, "Couldn't create an assistant"));
      setBusy(false);
    }
  }

  async function handleRename(a: AssistantRow) {
    const name = window.prompt('Rename assistant (e.g. "Onboarding", "New-hire interview")', a.name);
    if (name === null) return;
    const cleaned = name.trim().slice(0, 80);
    if (!cleaned || cleaned === a.name) return;
    try {
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from("assistants")
        .update({ name: cleaned, updated_at: updatedAt })
        .eq("id", a.id);
      if (error) throw error;
      setAssistants((prev) =>
        (prev ?? []).map((x) => (x.id === a.id ? { ...x, name: cleaned, updated_at: updatedAt } : x))
      );
      toast("Assistant renamed", true);
    } catch (err) {
      toast(errorMessage(err, "Couldn't rename"));
    }
  }

  async function handleDuplicate(a: AssistantRow) {
    if (!user || busy || atAssistantCap()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("assistants")
        .insert({
          user_id: user.id,
          name: `${a.name} (copy)`,
          first_message: a.first_message,
          persona: a.persona,
          prompt: a.prompt,
          voice: a.voice,
          model: a.model,
        })
        .select("id, name, first_message, persona, prompt, voice, model, created_at, updated_at")
        .single();
      if (error) throw error;
      setAssistants((prev) => [...(prev ?? []), data as AssistantRow]);
      toast("Assistant duplicated", true);
    } catch (err) {
      toast(capErrorMessage(err, "Couldn't duplicate"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(a: AssistantRow) {
    const deployed = deployments[a.id];
    const warning = deployed
      ? `Delete "${a.name}"? Its public link /talk/${deployed.slug} will stop working immediately.`
      : `Delete "${a.name}"? This can't be undone.`;
    if (!confirm(warning)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("assistants").delete().eq("id", a.id);
      if (error) throw error;
      setAssistants((prev) => (prev ?? []).filter((x) => x.id !== a.id));
      toast("Assistant deleted", true);
    } catch (err) {
      toast(errorMessage(err, "Couldn't delete"));
    } finally {
      setBusy(false);
    }
  }

  function handleCopyLink(slug: string) {
    const link = `${window.location.origin}/talk/${slug}`;
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    toast("Link copied", true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Assistants</h2>
          <p className="page-sub">
            Build and publish your AI onboarding agents. Edit the prompt in one place — publish, and the
            public link serves the new version instantly.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openPicker} disabled={busy}>
          <span className="btn-label">New assistant</span>
        </button>
      </div>

      {assistants === null ? (
        <div className="panel">
          <p className="panel-sub">Loading…</p>
        </div>
      ) : assistants.length === 0 ? (
        <div className="panel">
          <h3>No assistants yet</h3>
          <p className="panel-sub">
            Create your first AI onboarding assistant — set its persona and prompt, then publish it to get
            a shareable link.
          </p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={openPicker} disabled={busy}>
            <span className="btn-label">Create your first assistant</span>
          </button>
        </div>
      ) : (
        assistants.map((a) => {
          const dep = deployments[a.id];
          return (
            <div className="panel" key={a.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 220 }}>
                  <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {a.name}
                    {dep ? (
                      <span className="side-badge" title={`Published at /talk/${dep.slug}`}>Live</span>
                    ) : (
                      <span className="side-badge side-badge-admin">Draft</span>
                    )}
                  </h3>
                  <p className="panel-sub" style={{ margin: "4px 0 0" }}>
                    Updated {new Date(a.updated_at).toLocaleString()}
                    {dep ? ` · /talk/${dep.slug}` : " · not published yet"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => router.push(`/app/assistants/${a.id}`)}>
                    Edit
                  </button>
                  {dep && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCopyLink(dep.slug)}>
                      Copy link
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRename(a)} disabled={busy}>
                    Rename
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDuplicate(a)} disabled={busy}>
                    Duplicate
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDelete(a)} disabled={busy}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      {pickerOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tplPickerTitle" style={{ maxWidth: 520 }}>
            <div className="modal-head">
              <div className="modal-id">
                <div>
                  <h3 id="tplPickerTitle">New assistant</h3>
                  <p className="panel-sub">Start from a template — the questions stay the same, only the industry changes.</p>
                </div>
              </div>
              <button type="button" className="modal-close" aria-label="Close" onClick={() => setPickerOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gap: 10 }}>
                {ASSISTANT_TEMPLATES.map((t) => {
                  const active = t.id === pickedId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPickedId(t.id);
                        setIndustry(t.defaultIndustry);
                      }}
                      aria-pressed={active}
                      className="panel"
                      style={{
                        textAlign: "left",
                        cursor: "pointer",
                        margin: 0,
                        outline: active ? "2px solid currentColor" : "none",
                        opacity: active ? 1 : 0.75,
                      }}
                    >
                      <strong>{t.label}</strong>
                      <p className="panel-sub" style={{ margin: "4px 0 0" }}>{t.blurb}</p>
                    </button>
                  );
                })}
                <label style={{ display: "grid", gap: 6 }}>
                  <strong>Industry</strong>
                  <input
                    className="input"
                    type="text"
                    value={industry}
                    maxLength={60}
                    placeholder="e.g. SaaS, concrete construction, window cleaning"
                    onChange={(e) => setIndustry(e.currentTarget.value)}
                  />
                  <span className="panel-sub">Swapped into the persona and prompt — everything else is ready to publish.</span>
                </label>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary" onClick={() => setPickerOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleNew} disabled={busy}>
                <span className="btn-label">{busy ? "Creating…" : "Create assistant"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callBrible } from "@/lib/edgeFunctions";
import { AssistantRow, DeploymentRow, stripVoiceBlock } from "@/lib/assistantTemplate";

function randomSlug() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export default function AssistantEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { syncCreditsFromServer } = useCredits();
  const toast = useToast();
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [assistant, setAssistant] = useState<AssistantRow | null>(null);
  const [deployment, setDeployment] = useState<DeploymentRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [change, setChange] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("assistants")
      .select("id, name, first_message, persona, prompt, voice, model, created_at, updated_at")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
          return;
        }
        // Old Playground prompts carried a trailing VOICE: block that
        // agent-talk duplicates at serve time — strip it in the editor.
        const row = data as AssistantRow;
        setAssistant({ ...row, prompt: stripVoiceBlock(row.prompt) });
      });
    supabase
      .from("agent_deployments")
      .select("id, assistant_id, slug, updated_at")
      .eq("assistant_id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDeployment((data as DeploymentRow | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase, id]);

  function patch(fields: Partial<AssistantRow>) {
    setAssistant((prev) => (prev ? { ...prev, ...fields } : prev));
  }

  async function handleRewrite() {
    if (!assistant) return;
    const instruction = change.trim();
    if (!instruction) {
      toast("Describe the change you want first");
      return;
    }
    setRewriting(true);
    try {
      const out = await callBrible<{ remaining?: number; persona?: string; prompt?: string }>(supabase, {
        mode: "rewrite-prompt",
        instruction,
        currentPersona: assistant.persona,
        currentPrompt: assistant.prompt,
      });
      if (typeof out.remaining === "number") syncCreditsFromServer(out.remaining);
      patch({
        persona: out.persona?.trim() || assistant.persona,
        prompt: out.prompt?.trim() || assistant.prompt,
      });
      setChange("");
      toast("Prompt rewritten. Review it, then hit Save.", true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "not-signed-in") {
        patch({ prompt: assistant.prompt.replace(/\s+$/, "") + "\n\nADDITIONAL DIRECTIVE:\n- " + instruction });
        setChange("");
        toast("Change added to the prompt as a directive.", true);
      } else {
        toast(message || "The AI rewrite service is unavailable right now");
      }
    } finally {
      setRewriting(false);
    }
  }

  async function handleSave(): Promise<AssistantRow | null> {
    if (!assistant) return null;
    const cleaned: AssistantRow = {
      ...assistant,
      name: assistant.name.trim() || "Untitled assistant",
      prompt: stripVoiceBlock(assistant.prompt),
    };
    setSaving(true);
    try {
      const { error } = await supabase
        .from("assistants")
        .update({
          name: cleaned.name,
          first_message: cleaned.first_message,
          persona: cleaned.persona,
          prompt: cleaned.prompt,
          voice: cleaned.voice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cleaned.id);
      if (error) throw error;
      setAssistant(cleaned);
      logActivity("system", `Updated the "${cleaned.name}" assistant`);
      toast("Assistant saved", true);
      return cleaned;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save right now");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!user || !assistant) return;
    // Publish always saves first — the deployment must snapshot exactly
    // what's on screen, not a stale draft.
    const saved = await handleSave();
    if (!saved) return;
    if (!saved.persona.trim() || !saved.prompt.trim()) {
      toast("Give the assistant a persona and a prompt before publishing");
      return;
    }

    setPublishing(true);
    try {
      const slug = deployment?.slug ?? randomSlug();
      const { data, error } = await supabase
        .from("agent_deployments")
        .upsert(
          {
            user_id: user.id,
            assistant_id: saved.id,
            slug,
            persona: saved.persona.trim(),
            prompt: saved.prompt.trim(),
            voice: saved.voice.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "assistant_id" }
        )
        .select("id, assistant_id, slug, updated_at")
        .single();
      if (error) throw error;
      const wasLive = !!deployment;
      setDeployment(data as DeploymentRow);
      toast(wasLive ? "Live version updated" : "Assistant published", true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't publish right now");
    } finally {
      setPublishing(false);
    }
  }

  function handleCopyLink() {
    if (!deployment) return;
    const link = `${window.location.origin}/talk/${deployment.slug}`;
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    toast("Link copied", true);
  }

  if (notFound) {
    return (
      <div className="panel">
        <h3>Assistant not found</h3>
        <p className="panel-sub">It may have been deleted.</p>
        <Link className="btn btn-secondary btn-sm" href="/app/assistants" style={{ marginTop: 10 }}>
          Back to Assistants
        </Link>
      </div>
    );
  }

  if (!assistant) {
    return (
      <div className="panel">
        <p className="panel-sub">Loading…</p>
      </div>
    );
  }

  const link = deployment ? `${window.location.origin}/talk/${deployment.slug}` : "";

  return (
    <>
      <div className="page-head">
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => router.push("/app/assistants")}
              aria-label="Back to assistants"
            >
              ←
            </button>
            {assistant.name || "Untitled assistant"}
          </h2>
          <p className="page-sub">
            Change the script once here — publish, and it&rsquo;s live everywhere instantly. No manual rebuilding.
          </p>
        </div>
      </div>

      <div className="pp-layout">
        <div className="pp-col">
          <div className="panel">
            <h3>Tell it what to change</h3>
            <p className="panel-sub">Plain English. Example: &ldquo;Make this an AI interviewer that screens sales candidates and asks about their closing experience.&rdquo;</p>
            <div className="field">
              <label className="sr-only" htmlFor="ppChange">Describe the change</label>
              <textarea
                className="input pp-change"
                id="ppChange"
                rows={5}
                placeholder="Describe the change…"
                value={change}
                onChange={(e) => setChange(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={handleRewrite} disabled={rewriting}>
              <span className="btn-label">{rewriting ? "Rewriting…" : "Update prompt"}</span>
            </button>
            <p className="hint" style={{ marginTop: 10 }}>AI rewrites are included in your plan — no setup needed.</p>
          </div>

          <div className="panel">
            <h3>Publish</h3>
            {deployment ? (
              <>
                <p className="panel-sub">Anyone with this link can talk to this assistant — no login required.</p>
                <div className="field" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="btn btn-secondary" onClick={handleCopyLink}>
                    Copy
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  Live version from {new Date(deployment.updated_at).toLocaleString()}. The link never changes.
                </p>
              </>
            ) : (
              <p className="panel-sub">Publishing creates a public chat link for this assistant.</p>
            )}
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              onClick={handlePublish}
              disabled={publishing || saving}
            >
              <span className="btn-label">
                {publishing ? "Publishing…" : deployment ? "Publish latest version" : "Publish assistant"}
              </span>
            </button>
          </div>
        </div>

        <div className="pp-col">
          <div className="panel">
            <span className="pp-label">Name</span>
            <input
              className="input"
              value={assistant.name}
              placeholder="e.g. Onboarding agent"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="panel">
            <span className="pp-label">First message</span>
            <p className="panel-sub">How the assistant opens the conversation.</p>
            <textarea
              className="input pp-editor"
              rows={3}
              spellCheck={false}
              value={assistant.first_message}
              onChange={(e) => patch({ first_message: e.target.value })}
            />
          </div>
          <div className="panel">
            <span className="pp-label">Voice &amp; tone</span>
            <p className="panel-sub">How the AI should sound. Applied automatically when it talks — no need to repeat it in the prompt.</p>
            <textarea
              className="input pp-editor"
              rows={3}
              placeholder="e.g. warm, direct, a little playful — no corporate jargon"
              spellCheck={false}
              value={assistant.voice}
              onChange={(e) => patch({ voice: e.target.value })}
            />
          </div>
          <div className="panel">
            <span className="pp-label">Persona (company background)</span>
            <textarea
              className="input pp-editor"
              rows={5}
              spellCheck={false}
              value={assistant.persona}
              onChange={(e) => patch({ persona: e.target.value })}
            />
          </div>
          <div className="panel">
            <span className="pp-label">Prompt</span>
            <textarea
              className="input pp-editor pp-mono"
              rows={16}
              spellCheck={false}
              value={assistant.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
            />
          </div>
          <div className="pp-saverow">
            <button type="button" className="btn btn-primary pp-save" onClick={handleSave} disabled={saving}>
              <span className="btn-label">{saving ? "Saving…" : "Save changes"}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { getJSON, scopedKey } from "@/lib/storage";

type PlaygroundState = { persona?: string; voice?: string; prompt?: string };
type Deployment = { slug: string; persona: string; prompt: string; voice: string; updated_at: string };

function playgroundStorageKey(email?: string | null) {
  return scopedKey("bsl_playground", email || "guest");
}

function randomSlug() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export default function DeployPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [supabase] = useState(() => createClient());
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("agent_deployments")
      .select("slug, persona, prompt, voice, updated_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDeployment((data as Deployment | null) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  async function handleDeploy() {
    if (!user) return;
    const stored = getJSON<PlaygroundState>(playgroundStorageKey(user.email));
    const persona = (stored?.persona ?? "").trim();
    const prompt = (stored?.prompt ?? "").trim();
    const voice = (stored?.voice ?? "").trim();
    if (!persona || !prompt) {
      toast("Set up your agent in the Playground first");
      return;
    }

    setSaving(true);
    try {
      const slug = deployment?.slug ?? randomSlug();
      const { data, error } = await supabase
        .from("agent_deployments")
        .upsert({ user_id: user.id, slug, persona, prompt, voice }, { onConflict: "user_id" })
        .select("slug, persona, prompt, voice, updated_at")
        .single();
      if (error) throw error;
      const wasDeployed = !!deployment;
      setDeployment(data as Deployment);
      toast(wasDeployed ? "Deployment updated with your latest prompt" : "Onboarding agent deployed", true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't deploy right now");
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    if (!deployment) return;
    const link = `${window.location.origin}/talk/${deployment.slug}`;
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    toast("Link copied", true);
  }

  const link = deployment ? `${window.location.origin}/talk/${deployment.slug}` : "";

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Deploy</h2>
          <p className="page-sub">Turn your Playground prompt into a link. Paste it into an email or text to invite a client to onboard through your AI agent.</p>
        </div>
      </div>

      <div className="panel">
        <h3>{deployment ? "Your onboarding agent link" : "Get your onboarding agent link"}</h3>

        {loading ? (
          <p className="panel-sub">Loading…</p>
        ) : deployment ? (
          <>
            <p className="panel-sub">Anyone with this link can talk to your onboarding agent — no login required.</p>
            <div className="field" style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className="input"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="btn btn-secondary" onClick={handleCopy}>
                Copy
              </button>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Last updated {new Date(deployment.updated_at).toLocaleString()}.
            </p>
          </>
        ) : (
          <p className="panel-sub">Set up the persona and prompt in Playground, then deploy it here to get a shareable link.</p>
        )}

        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 16 }}
          onClick={handleDeploy}
          disabled={saving || loading}
        >
          <span className="btn-label">
            {saving ? "Deploying…" : deployment ? "Update deployment" : "Deploy onboarding agent"}
          </span>
        </button>
        {deployment && (
          <p className="hint" style={{ marginTop: 10 }}>
            Changed the prompt in Playground? Click &ldquo;Update deployment&rdquo; to push the latest version live — the link itself never changes.
          </p>
        )}
      </div>
    </>
  );
}

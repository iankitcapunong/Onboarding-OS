"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { callAdminClientsList, callAdminClientsSet, EdgeFunctionError, type AdminClient } from "@/lib/edgeFunctions";
import { ADMIN_EMAILS, FEATURES, PLANS, planFor, type FeatureKey, type PlanKey } from "@/lib/featureGating";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function fullFlags(overrides: Partial<Record<FeatureKey, boolean>> | null): Record<FeatureKey, boolean> {
  const flags = {} as Record<FeatureKey, boolean>;
  FEATURES.forEach((f) => {
    flags[f.key] = overrides ? overrides[f.key] !== false : true;
  });
  return flags;
}

function ClientRow({
  client,
  supabase,
  onChange,
}: {
  client: AdminClient;
  supabase: ReturnType<typeof createClient>;
  onChange: () => void;
}) {
  const { logActivity } = useActivityLog();
  const toast = useToast();
  const isAdminAcct = ADMIN_EMAILS.includes(client.email);
  const [flags, setFlags] = useState(() => fullFlags(client.features));
  // Adjust state during render (not via an effect) when the parent's
  // refetch brings in a new features value for this client — a pure
  // prop-driven reset, no external system involved.
  const [trackedFeatures, setTrackedFeatures] = useState(client.features);
  if (trackedFeatures !== client.features) {
    setTrackedFeatures(client.features);
    setFlags(fullFlags(client.features));
  }
  const current = planFor(flags);
  const currentPlanLabel = PLANS.find((p) => p.key === current)?.label ?? "Custom";
  const name = client.email.split("@")[0];

  if (isAdminAcct) {
    return (
      <div className="access-card is-admin">
        <div className="access-card-head">
          <span className="access-avatar is-admin" aria-hidden="true">
            {initials(client.email)}
          </span>
          <div className="access-id">
            <strong>{name}</strong>
            <span>{client.email}</span>
          </div>
          <span className="badge badge-admin">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="m12 1.5 2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.6l-6.1 3.4 1.5-6.8L2.2 8.5l6.9-.7z" />
            </svg>
            Admin
          </span>
        </div>
        <p className="hint access-note">
          Full access to every feature, unmetered credits. Admin status can only be changed in code (ADMIN_EMAILS).
        </p>
      </div>
    );
  }

  async function persist(patch: { plan?: PlanKey; features?: Partial<Record<FeatureKey, boolean>> | null }) {
    try {
      await callAdminClientsSet(supabase, client.userId, patch);
      onChange();
    } catch (err) {
      toast(err instanceof EdgeFunctionError && err.message ? err.message : "Couldn't update this client — try again in a moment.");
    }
  }

  function setPlan(planKey: (typeof PLANS)[number]["key"], planLabel: string, planFeatures: FeatureKey[]) {
    const next = { ...flags };
    FEATURES.forEach((f) => {
      next[f.key] = planFeatures.includes(f.key);
    });
    setFlags(next);
    void persist({ plan: planKey, features: next });
    logActivity("system", `Set ${client.email} to the ${planLabel} plan`);
    toast(`${name} moved to ${planLabel}`, true);
  }

  function toggleFeature(f: (typeof FEATURES)[number]) {
    const next = { ...flags, [f.key]: !flags[f.key] };
    setFlags(next);
    void persist({ plan: planFor(next), features: next });
    logActivity("system", `${next[f.key] ? "Enabled" : "Disabled"} ${f.label} for ${client.email}`);
    toast(`${f.label}${next[f.key] ? " enabled" : " disabled"} for ${name}`, true);
  }

  function handleReset() {
    setFlags(fullFlags(null));
    void persist({ features: null });
    logActivity("system", `Reset access for ${client.email}`);
    toast(`${name} reset to full access`, true);
  }

  return (
    <div className="access-card">
      <div className="access-card-head">
        <span className="access-avatar" aria-hidden="true">
          {initials(client.email)}
        </span>
        <div className="access-id">
          <strong>{name}</strong>
          <span>{client.email}</span>
        </div>
        <span className={`plan-tag${current === "custom" ? " is-custom" : ""}`}>{currentPlanLabel}</span>
      </div>

      <div className="access-section">
        <span className="access-section-label">Plan</span>
        <div className="plan-pills">
          {PLANS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`plan-pill${current === p.key ? " active" : ""}`}
              aria-pressed={current === p.key}
              title={`${p.features.length} of ${FEATURES.length} features`}
              onClick={() => setPlan(p.key, p.label, p.features)}
            >
              {p.label}
            </button>
          ))}
          {current === "custom" && <span className="plan-pill is-custom">Custom mix</span>}
        </div>
      </div>

      <div className="access-section">
        <span className="access-section-label">Features</span>
        <div className="feat-grid">
          {FEATURES.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`feat-toggle${flags[f.key] ? " on" : ""}`}
              role="switch"
              aria-checked={flags[f.key]}
              onClick={() => toggleFeature(f)}
            >
              <span className="feat-toggle-track" aria-hidden="true">
                <span className="feat-toggle-thumb" />
              </span>
              <span className="feat-toggle-label">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="access-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 2.6-6.3" />
            <path d="M3 4v5h5" />
          </svg>
          Reset to full access
        </button>
      </div>
    </div>
  );
}

export default function AccessPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin } = useFeatureGating();
  const [supabase] = useState(() => createClient());
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [refreshTick, forceRefresh] = useState(0);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/app/dashboard");
  }, [user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    callAdminClientsList(supabase)
      .then((res) => {
        if (!cancelled) setClients(res.clients);
      })
      .catch(() => {
        // best-effort — the page just shows an empty list on failure
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, supabase, refreshTick]);

  function handleChange() {
    forceRefresh((n) => n + 1);
  }

  if (!isAdmin) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Client access</h2>
          <p className="page-sub">
            Give each client a plan — Starter, Growth, or Full access — or tune individual features. Whatever is off disappears from their sidebar; they only see what their subscription includes.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="access-list" aria-label="Client feature access">
          {clients.map((c) => (
            <ClientRow key={c.userId} client={c} supabase={supabase} onChange={handleChange} />
          ))}
        </div>
      </div>
    </>
  );
}

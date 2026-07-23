"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/components/app/ToastProvider";
import { scopedKey, scanScopedSuffixes } from "@/lib/storage";
import {
  ADMIN_EMAILS,
  FEATURES,
  PLANS,
  loadAccessFor,
  saveAccessFor,
  planFor,
  type FeatureKey,
} from "@/lib/featureGating";

type Client = { email: string; name: string };

/* "Known clients" mirrors the original's knownClients(): accounts that
   have logged in / been configured on THIS browser. The original read a
   demo-mode signup registry (bsl_users) that this rebuild dropped along
   with the localStorage auth fallback (see Phase 2) — the closest
   faithful equivalent with a real backend and no server-side admin API
   is discovering every email an admin has ever set feature flags for,
   via the bsl_features:<email> keys already scoped per account. */
function knownClients(selfEmail: string): Client[] {
  const seen = new Set<string>();
  const list: Client[] = [];
  function add(email: string) {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push({ email: key, name: key.split("@")[0] });
  }
  scanScopedSuffixes("bsl_features").forEach(add);
  add(selfEmail);
  return list;
}

function ClientRow({ client, onChange }: { client: Client; onChange: () => void }) {
  const { logActivity } = useActivityLog();
  const toast = useToast();
  const isAdminAcct = ADMIN_EMAILS.includes(client.email);
  const [flags, setFlags] = useState(() => loadAccessFor(client.email).features);
  const current = planFor(flags);

  if (isAdminAcct) {
    return (
      <div className="access-row">
        <div className="access-id">
          <strong>{client.name}</strong>
          <span>{client.email}</span>
          <span className="badge badge-soft">Admin</span>
        </div>
        <p className="hint access-note">Admin accounts always have full access.</p>
      </div>
    );
  }

  function setPlan(planKey: (typeof PLANS)[number]["key"], planLabel: string, planFeatures: FeatureKey[]) {
    const next = { ...flags };
    FEATURES.forEach((f) => {
      next[f.key] = planFeatures.includes(f.key);
    });
    setFlags(next);
    saveAccessFor(client.email, planKey, next);
    logActivity("system", `Set ${client.email} to the ${planLabel} plan`);
    toast(`${client.name} moved to ${planLabel}`, true);
    onChange();
  }

  function toggleFeature(f: (typeof FEATURES)[number]) {
    const next = { ...flags, [f.key]: !flags[f.key] };
    setFlags(next);
    saveAccessFor(client.email, planFor(next), next);
    logActivity("system", `${next[f.key] ? "Enabled" : "Disabled"} ${f.label} for ${client.email}`);
    toast(`${f.label}${next[f.key] ? " enabled" : " disabled"} for ${client.name}`, true);
    onChange();
  }

  function handleReset() {
    window.localStorage.removeItem(scopedKey("bsl_features", client.email));
    setFlags(loadAccessFor(client.email).features);
    logActivity("system", `Reset access for ${client.email}`);
    toast(`${client.name} reset to full access`, true);
    onChange();
  }

  return (
    <div className="access-row">
      <div className="access-id">
        <strong>{client.name}</strong>
        <span>{client.email}</span>
      </div>

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
        {current === "custom" && <span className="plan-pill is-custom">Custom</span>}
      </div>

      <div className="feat-grid">
        {FEATURES.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`feat-toggle${flags[f.key] ? " on" : ""}`}
            aria-pressed={flags[f.key]}
            onClick={() => toggleFeature(f)}
          >
            <span className="feat-dot" aria-hidden="true" />
            <span className="feat-label">{f.label}</span>
          </button>
        ))}
      </div>

      <div className="access-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
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
  const email = (user?.email || "").toLowerCase();
  const [refreshTick, forceRefresh] = useState(0);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/app/dashboard");
  }, [user, isAdmin, router]);

  // Recomputed from localStorage on every refreshTick bump — cheap (one
  // prefix scan) and avoids the SSR/CSR mismatch a synced-via-effect
  // state would need, since this whole page renders null until `isAdmin`
  // resolves post-hydration anyway (see the early return below).
  const clients = email ? knownClients(email) : [];
  void refreshTick;

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
        <div aria-label="Client feature access">
          {clients.map((c) => (
            <ClientRow key={c.email} client={c} onChange={handleChange} />
          ))}
        </div>
      </div>
    </>
  );
}

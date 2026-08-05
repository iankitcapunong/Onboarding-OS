"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { logActivity } = useActivityLog();
  const { isAdmin, planLabel } = useFeatureGating();
  const toast = useToast();
  const [supabase] = useState(() => createClient());

  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // user loads asynchronously post-mount (AuthProvider); sync the local
    // editable field once it arrives, but never clobber an in-progress edit.
    if (!nameTouched && user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName((user.user_metadata?.name as string | undefined) || "");
    }
  }, [user, nameTouched]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Name can't be empty");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { name: trimmed } });
    setSaving(false);

    if (error) {
      toast(`Couldn't save: ${error.message}`);
      return;
    }
    logActivity("system", `Updated profile name to ${trimmed}`);
    toast("Profile saved", true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p className="page-sub">Your account and plan.</p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="panel">
          <h3>Profile</h3>
          <div className="field">
            <label htmlFor="setName">Name</label>
            <input
              className="input"
              type="text"
              id="setName"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="setEmail">Email</label>
            <input className="input" type="email" id="setEmail" value={user?.email || ""} readOnly />
            <p className="hint">Email is your login and can&apos;t be changed here.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <span className="btn-label">{saving ? "Saving…" : "Save changes"}</span>
          </button>
        </div>
        <div className="panel">
          <h3>Plan</h3>
          <div className="plan-box">
            <div className="row-between">
              <strong>Onboarding OS {isAdmin ? "Admin" : planLabel}</strong>
              <span className="badge badge-soft">Active</span>
            </div>
            <p className="panel-sub" style={{ margin: "8px 0 0" }}>
              $297/month · unlimited sessions · 3 curated models
            </p>
          </div>
          <hr className="divider" />
          <h3 style={{ marginTop: 4 }}>Session</h3>
          <button type="button" className="btn btn-secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

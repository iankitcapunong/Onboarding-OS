"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/app/ToastProvider";
import { createClient } from "@/lib/supabase/client";

type SessionRow = {
  id: string;
  slug: string;
  started_at: string;
  last_message_at: string;
  message_count: number;
  ended_at: string | null;
  agent_deployments: { assistant_id: string; assistants: { name: string } | null } | null;
};

type MessageRow = {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function durationLabel(s: SessionRow): string {
  const ms = new Date(s.ended_at ?? s.last_message_at).getTime() - new Date(s.started_at).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function LogsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [supabase] = useState(() => createClient());
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [assistantFilter, setAssistantFilter] = useState("all");
  const [openSession, setOpenSession] = useState<SessionRow | null>(null);
  const [transcript, setTranscript] = useState<MessageRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("agent_sessions")
      .select(
        "id, slug, started_at, last_message_at, message_count, ended_at, agent_deployments(assistant_id, assistants(name))"
      )
      .order("started_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast(error.message);
          setSessions([]);
          return;
        }
        setSessions((data ?? []) as unknown as SessionRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase, toast]);

  useEffect(() => {
    if (!openSession) {
      setTranscript(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("agent_messages")
      .select("id, role, content, created_at")
      .eq("session_id", openSession.id)
      .order("id", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast(error.message);
          setTranscript([]);
          return;
        }
        setTranscript((data ?? []) as MessageRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [openSession, supabase, toast]);

  const assistants = useMemo(() => {
    const seen = new Map<string, string>();
    (sessions ?? []).forEach((s) => {
      const dep = s.agent_deployments;
      if (dep) seen.set(dep.assistant_id, dep.assistants?.name ?? "Deleted assistant");
    });
    return [...seen.entries()];
  }, [sessions]);

  const visible = (sessions ?? []).filter(
    (s) => assistantFilter === "all" || s.agent_deployments?.assistant_id === assistantFilter
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Agent logs</h2>
          <p className="page-sub">
            Every conversation your published assistants have had — flows straight back into your own
            records automatically, nothing to reconnect by hand.
          </p>
        </div>
        {assistants.length > 1 && (
          <select
            className="input"
            style={{ width: "auto" }}
            value={assistantFilter}
            onChange={(e) => setAssistantFilter(e.target.value)}
            aria-label="Filter by assistant"
          >
            <option value="all">All assistants</option>
            {assistants.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {sessions === null ? (
        <div className="panel">
          <p className="panel-sub">Loading…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <h3>No conversations yet</h3>
          <p className="panel-sub">
            Once someone talks to a published assistant through its public link, the full transcript
            shows up here.
          </p>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-3)" }}>
                <th style={{ padding: "12px 16px" }}>Assistant</th>
                <th style={{ padding: "12px 16px" }}>Started</th>
                <th style={{ padding: "12px 16px" }}>Duration</th>
                <th style={{ padding: "12px 16px" }}>Messages</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    {s.agent_deployments?.assistants?.name ?? "Deleted assistant"}
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    {new Date(s.started_at).toLocaleString()}
                  </td>
                  <td style={{ padding: "12px 16px" }}>{durationLabel(s)}</td>
                  <td style={{ padding: "12px 16px" }}>{s.message_count}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {s.ended_at ? (
                      <span className="side-badge">Ended</span>
                    ) : (
                      <span className="side-badge side-badge-admin">Open</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenSession(s)}>
                      View transcript
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openSession && (
        <div
          className="modal-overlay open"
          role="dialog"
          aria-modal="true"
          aria-label="Conversation transcript"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenSession(null);
          }}
        >
          <div className="modal" style={{ maxWidth: 640 }}>
            <button type="button" className="modal-close" aria-label="Close transcript" onClick={() => setOpenSession(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
            <h3>{openSession.agent_deployments?.assistants?.name ?? "Conversation"}</h3>
            <p className="panel-sub" style={{ margin: "4px 0 14px" }}>
              {new Date(openSession.started_at).toLocaleString()} · {openSession.message_count} messages
            </p>
            <div style={{ maxHeight: "55vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {transcript === null ? (
                <p className="panel-sub">Loading…</p>
              ) : transcript.length === 0 ? (
                <p className="panel-sub">No messages recorded for this session.</p>
              ) : (
                transcript.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      background: m.role === "user" ? "var(--primary)" : "var(--surface-2)",
                      color: m.role === "user" ? "#fff" : "var(--ink)",
                      border: m.role === "user" ? "none" : "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "8px 12px",
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.content}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

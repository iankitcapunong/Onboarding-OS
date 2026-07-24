import type { SessionRow } from "@/lib/dashboardStats";
import { fmtWhen } from "@/hooks/useCallCapture";

const PILL: Record<SessionRow["status"], { label: string; cls: string }> = {
  done: { label: "Completed", cls: "pill-done" },
  progress: { label: "In progress", cls: "pill-progress" },
  dropped: { label: "Dropped off", cls: "pill-dropped" },
};

export function RecentSessionsTable({ sessions }: { sessions: SessionRow[] }) {
  if (!sessions.length) {
    return <p className="panel-sub">No sessions yet — capture your first call to see it here.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Status</th>
            <th scope="col">Assets</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.key}>
              <td>{s.session}</td>
              <td>
                <span className={`pill ${PILL[s.status].cls}`}>{PILL[s.status].label}</span>
              </td>
              <td>{s.assets || "·"}</td>
              <td>{fmtWhen(s.when)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

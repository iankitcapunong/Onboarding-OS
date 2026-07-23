type SessionStatus = "done" | "progress" | "dropped";

const SESSIONS: { client: string; business: string; status: SessionStatus; assets: number; date: string }[] = [
  { client: "Maria Rivera", business: "Rivera Real Estate", status: "done", assets: 4, date: "Today" },
  { client: "David Chen", business: "Chen Coaching", status: "done", assets: 3, date: "Yesterday" },
  { client: "Sofia Alvarez", business: "Alvarez Dental", status: "progress", assets: 0, date: "Yesterday" },
  { client: "James Okafor", business: "Okafor Fitness", status: "done", assets: 4, date: "Jun 29" },
  { client: "Lena Kowalski", business: "LK Interiors", status: "dropped", assets: 0, date: "Jun 28" },
  { client: "Tom Baker", business: "Baker & Sons Roofing", status: "done", assets: 3, date: "Jun 27" },
];

const PILL: Record<SessionStatus, { label: string; cls: string }> = {
  done: { label: "Completed", cls: "pill-done" },
  progress: { label: "In progress", cls: "pill-progress" },
  dropped: { label: "Dropped off", cls: "pill-dropped" },
};

export function RecentSessionsTable() {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col">Business</th>
            <th scope="col">Status</th>
            <th scope="col">Assets</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {SESSIONS.map((s) => (
            <tr key={s.client}>
              <td>{s.client}</td>
              <td>{s.business}</td>
              <td>
                <span className={`pill ${PILL[s.status].cls}`}>{PILL[s.status].label}</span>
              </td>
              <td>{s.assets || "·"}</td>
              <td>{s.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

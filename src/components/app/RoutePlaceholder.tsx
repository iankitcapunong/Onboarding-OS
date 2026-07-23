export function RoutePlaceholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        <p className="page-sub">{note ?? "This route is coming soon."}</p>
      </div>
    </div>
  );
}

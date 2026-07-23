export function FormAlert({ message, info }: { message: string; info?: boolean }) {
  if (!message) return null;
  return (
    <div className={`form-alert visible${info ? " info" : ""}`} role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

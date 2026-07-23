"use client";

import { forwardRef, useState } from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  props,
  ref
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="pw-wrap">
      <input {...props} ref={ref} className="input" type={visible ? "text" : "password"} />
      <button
        type="button"
        className="pw-toggle"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  );
});

"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Toast = { id: number; msg: string; ok: boolean };
type ToastContextValue = (msg: string, ok?: boolean) => void;

const ToastContext = createContext<ToastContextValue | null>(null);

/* Direct replacement for js/app.js's toast()/window.bslToast — same
   3.8s auto-dismiss, same success-checkmark variant. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((msg: string, ok = false) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, msg, ok }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.ok ? " success" : ""}`}>
            {t.ok && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

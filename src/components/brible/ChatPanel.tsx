"use client";

import { useEffect, useRef, useState } from "react";
import { useBrible } from "@/hooks/useBrible";
import { BRIBLE_CHIPS } from "@/lib/brible/constants";

const BOT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

/* renders a bot message that starts with the publish-link prefix as a
   clickable link, matching the opportunity the original's DOM-based
   briblePublishMsg() took (see BRIBLE_ENGINE_API.md's known-simplification
   #4) — persisted chat text stays plain, only the live render is special. */
function BotMessageBody({ text }: { text: string }) {
  const prefix = "Your site is live: ";
  if (text.startsWith(prefix)) {
    const url = text.slice(prefix.length);
    return (
      <>
        🎉 Your site is live:{" "}
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url.replace(/^https?:\/\//, "").split("?")[0]}
        </a>
      </>
    );
  }
  return <>{text}</>;
}

/* Direct port of js/app.js's chat column: bribleAddMsg()/bribleTyping()
   (lines ~3944-3971), bribleGenStatus()/bribleGenStep()'s live
   progress rows (lines ~4758-4789), the #bribleChips quick-reply chips
   (BRIBLE_CHIPS, line ~4970), the #bribleScope selector, and the
   #bribleForm input row + selection-aware placeholder (lines
   ~4054-4079). The selection bar itself (#bribleSelBar) lives in the
   stage, not here — see PreviewStage.tsx. */
export function ChatPanel() {
  const { chat, welcomeText, generating, genProgress, selection, scope, setScope, sendMessage } = useBrible();
  const [text, setText] = useState("");
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, generating, genProgress]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    void sendMessage(trimmed);
  }

  return (
    <aside className="brible-chat">
      <div className="brible-msgs" aria-live="polite" ref={msgsRef}>
        {chat.map((m, i) => {
          const body = m.text === "welcome" ? welcomeText : m.text;
          return (
            <div className={`bmsg ${m.role === "user" ? "bmsg-user" : "bmsg-bot"}`} key={i}>
              {m.role === "bot" && (
                <span className="bmsg-avatar" aria-hidden="true">
                  {BOT_ICON}
                </span>
              )}
              <span className="bmsg-body">{m.role === "bot" ? <BotMessageBody text={body} /> : body}</span>
            </div>
          );
        })}
        {generating && (
          <div className="bmsg bmsg-bot bmsg-typing">
            <span className="bmsg-avatar" aria-hidden="true">
              {BOT_ICON}
            </span>
            {genProgress.length ? (
              <span className="bmsg-body">
                <span className="bwork-head">Brible is working…</span>
                <div className="bwork-list">
                  {genProgress.map((step) => (
                    <div className={`bwork-item ${step.state}`} key={step.key}>
                      {step.state === "done" ? (
                        <span className="bwork-check">✓</span>
                      ) : step.state === "error" ? (
                        <span className="bwork-x">✕</span>
                      ) : (
                        <span className="bspin" />
                      )}
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              </span>
            ) : (
              <span className="bmsg-body">
                <span className="tdot" />
                <span className="tdot" />
                <span className="tdot" />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="brible-chips" id="bribleChips">
        {BRIBLE_CHIPS.map((c) => (
          <button key={c} type="button" className="bchip" disabled={generating} onClick={() => void sendMessage(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="brible-scope-row" id="bribleScopeRow">
        <label htmlFor="bribleScope">Apply to</label>
        <select id="bribleScope" value={scope} onChange={(e) => setScope(e.target.value as "auto" | "page" | "site")}>
          <option value="auto">Auto</option>
          <option value="page">This page</option>
          <option value="site">Whole site</option>
        </select>
      </div>

      <form className="brible-inputrow" onSubmit={handleSubmit}>
        <input
          className="brible-input"
          type="text"
          placeholder={selection ? "Type the new text for the selected element…" : "Ask Brible to build or change anything…"}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={generating}
        />
        <button className="brible-send" type="submit" aria-label="Send" disabled={generating}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m22 2-7 20-4-9-9-4z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </form>
    </aside>
  );
}

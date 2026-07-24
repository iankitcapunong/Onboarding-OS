import { AgentWidget } from "@/components/site/AgentWidget";

/* Deliberately just the voice agent.

   NOTE for whoever picks this up: the manual transcript-capture UI that used
   to live here (a start/stop button plus a "Call summary" panel) was the ONLY
   caller of useCallCapture's startCapture/stopCapture. Other pages —
   /app/calls, /app/dashboard (via lib/dashboardStats.ts) and /app/onboarding —
   still READ the resulting call logs, so with capture gone nothing populates
   them and they will stay empty. The hook and its CallCaptureProvider in
   app/layout.tsx are intentionally left in place: they're still imported by
   those pages, and this is the one file to restore from git if the capture
   flow is wanted back. */

export default function AgentPage() {
  return (
    <div className="voice-panel">
      <span className="voice-eyebrow">Voice onboarding</span>
      <h3>Talk to your AI onboarding specialist</h3>
      <p className="voice-sub">
        Start a conversation with the agent below to begin your onboarding session.
      </p>
      <div className="voice-box">
        <div className="voice-widget-slot">
          <AgentWidget />
        </div>
      </div>
      <p className="voice-note">
        Please allow microphone access when prompted so the agent can hear you.
      </p>
    </div>
  );
}

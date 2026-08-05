import { AuthProvider } from "@/hooks/useAuth";
import { ToastProvider } from "@/components/app/ToastProvider";
import { ActivityProvider } from "@/hooks/useActivityLog";
import { CreditsProvider } from "@/hooks/useCredits";
import { MemoryProvider } from "@/hooks/useMemory";
import { AssetsProvider } from "@/hooks/useAssets";
import { CallCaptureProvider } from "@/hooks/useCallCapture";
import { AppShell } from "@/components/app/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-body">
      <AuthProvider>
        <ToastProvider>
          <ActivityProvider>
            <CreditsProvider>
              <MemoryProvider>
                <CallCaptureProvider>
                  <AssetsProvider>
                    <AppShell>{children}</AppShell>
                  </AssetsProvider>
                </CallCaptureProvider>
              </MemoryProvider>
            </CreditsProvider>
          </ActivityProvider>
        </ToastProvider>
      </AuthProvider>
    </div>
  );
}

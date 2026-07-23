import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in · Onboarding OS",
};

export default function LoginPage() {
  return (
    <div className="auth-body">
      <AuthShell>
        <LoginForm />
      </AuthShell>
    </div>
  );
}

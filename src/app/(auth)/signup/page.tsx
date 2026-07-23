import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Sign up · Onboarding OS",
};

export default function SignupPage() {
  return (
    <div className="auth-body">
      <AuthShell>
        <Suspense>
          <SignupForm />
        </Suspense>
      </AuthShell>
    </div>
  );
}

import type { ReactNode } from "react";
import { GroomBoxLogo } from "@/components/GroomBoxLogo";

// Sign-in, sign-up, onboarding, and invites: one narrow column (design brief §4).
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-8 md:px-6">
      <GroomBoxLogo />
      {children}
    </main>
  );
}

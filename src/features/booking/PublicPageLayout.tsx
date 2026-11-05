import type { ReactNode } from "react";
import { GroomBoxLogo } from "@/components/GroomBoxLogo";
import { messages } from "@/lib/messages";

// Public booking pages: one narrow column with no navigation chrome and no links to other shops.
// The shop is the brand; GroomBox appears small in the footer (design brief §6 and §10).
export function PublicPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 md:px-6">{children}</main>
      <footer className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <span>{messages.publicBranch.bookingsBy}</span>
        <GroomBoxLogo />
      </footer>
    </div>
  );
}

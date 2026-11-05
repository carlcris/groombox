import type { ReactNode } from "react";
import { cn } from "@/lib/class-names";

// The screen title. Focus moves here after each navigation (design brief §8), so it is focusable
// by script but not in the tab order.
export function PageHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 tabIndex={-1} data-page-heading className={cn("text-2xl font-semibold outline-none", className)}>
      {children}
    </h1>
  );
}

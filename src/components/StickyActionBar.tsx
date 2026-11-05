import type { ReactNode } from "react";

// The one primary action, pinned to the bottom on phones with safe-area padding and in the page
// flow from tablets up (design brief §5).
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg md:static md:mx-0 md:rounded-xl md:border md:pb-3">
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

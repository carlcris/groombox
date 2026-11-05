import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Icon, one sentence, and at most one action (design brief §5).
export function EmptyState({ icon: Icon, children, action }: { icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden />
      <p className="max-w-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

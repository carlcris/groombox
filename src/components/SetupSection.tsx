import type { ReactNode } from "react";

// A titled card that groups one part of a setup screen.
export function SetupSection({
  id,
  title,
  intro,
  action,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id={id} className="text-xl font-semibold">
            {title}
          </h2>
          {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

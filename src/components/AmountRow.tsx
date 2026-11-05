import { cn } from "@/lib/class-names";
import { formatPeso } from "@/lib/money-formatting";

// Label left, amount right in tabular figures. The "due now" row is larger and bold, with a top
// divider (design brief §5). A deduction shows with a minus sign before the peso sign.
export function AmountRow({ label, amount, emphasis = false }: { label: string; amount: number; emphasis?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", emphasis && "mt-1 border-t pt-3")}>
      <dt className={cn(emphasis ? "font-semibold" : "text-muted-foreground")}>{label}</dt>
      <dd className={cn("tabular-nums", emphasis ? "font-heading text-3xl font-semibold" : "font-medium")}>{amount < 0 ? `−${formatPeso(-amount)}` : formatPeso(amount)}</dd>
    </div>
  );
}

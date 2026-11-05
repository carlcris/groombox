import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { StickyActionBar } from "@/components/StickyActionBar";
import { groupServicesByCategory, type PublicBranchService } from "@/features/booking/public-branch-queries";
import { formatMinutes } from "@/lib/duration-formatting";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";

export function ServicePrice({ service }: { service: PublicBranchService }) {
  const price = formatPeso(service.price);
  return <>{service.priceIsStarting ? fillTemplate(messages.catalogue.startingAt, { price }) : price}</>;
}

// Step 1: one or more services, with a running total and duration (app flow §4).
export function ServiceStep({
  services,
  selectedIds,
  onChange,
  onContinue,
}: {
  services: PublicBranchService[];
  selectedIds: string[];
  onChange: (serviceIds: string[]) => void;
  onContinue: () => void;
}) {
  const selected = services.filter((service) => selectedIds.includes(service.id));
  const total = selected.reduce((sum, service) => sum + service.price, 0);
  const duration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);

  const toggle = (serviceId: string, checked: boolean) =>
    onChange(checked ? [...selectedIds, serviceId] : selectedIds.filter((id) => id !== serviceId));

  return (
    <>
      <div className="flex flex-col gap-6">
        {groupServicesByCategory(services).map((group) => (
          <section key={group.categoryId} aria-labelledby={`category-${group.categoryId}`} className="flex flex-col gap-2">
            <h2 id={`category-${group.categoryId}`} className="text-lg font-medium">
              {group.categoryName}
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border bg-card shadow-sm">
              {group.services.map((service) => (
                <li key={service.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-3">
                    <span className="flex flex-1 flex-col gap-1">
                      <span className="font-medium">{service.name}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatMinutes(service.durationMinutes)} · <ServicePrice service={service} />
                      </span>
                    </span>
                    <Checkbox
                      checked={selectedIds.includes(service.id)}
                      onCheckedChange={(value) => toggle(service.id, value === true)}
                      aria-label={service.name}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <StickyActionBar>
        {selected.length > 0 ? (
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              {fillTemplate(messages.booking.selectedSummary, { count: String(selected.length), duration: formatMinutes(duration) })}
            </span>
            <span className="font-heading text-xl font-semibold tabular-nums">{formatPeso(total)}</span>
          </div>
        ) : null}
        <Button className="w-full" disabled={selected.length === 0} onClick={onContinue}>
          {messages.booking.continue}
        </Button>
      </StickyActionBar>
    </>
  );
}

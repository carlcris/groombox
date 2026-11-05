import { CheckboxField } from "@/components/CheckboxField";
import type { BranchServiceOption } from "@/features/floor/visit-queries";
import { formatMinutes } from "@/lib/duration-formatting";
import { messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";

export function ServiceChecklist({
  services,
  selectedIds,
  onChange,
  error,
}: {
  services: BranchServiceOption[];
  selectedIds: string[];
  onChange: (serviceIds: string[]) => void;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="pb-1 text-base font-medium">{messages.floor.services}</legend>
      {services.map((service) => (
        <CheckboxField
          key={service.id}
          label={`${service.name} · ${formatMinutes(service.durationMinutes)} · ${formatPeso(service.price)}`}
          checked={selectedIds.includes(service.id)}
          onChange={(checked) => onChange(checked ? [...selectedIds, service.id] : selectedIds.filter((id) => id !== service.id))}
        />
      ))}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckboxField } from "@/components/CheckboxField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupSection } from "@/components/SetupSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { activeServicesQueryOptions, type ActiveService } from "@/features/catalogue/catalogue-queries";
import { branchOfferingsQueryOptions, branchSetupQueryKey } from "@/features/branch-setup/branch-setup-queries";
import { refreshBranchData } from "@/features/organization/branch-cache";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { SetupGuardError } from "@/features/organization/setup-guard-error";
import { fillTemplate, messages } from "@/lib/messages";
import { formatPeso } from "@/lib/money-formatting";
import { amountText, textToOptionalNumber } from "@/lib/number-field-schemas";
import { supabase } from "@/lib/supabase-client";

export function OfferingsSection({
  branch,
  isPublished,
  offeredServiceCount,
}: {
  branch: WorkBranch;
  isPublished: boolean;
  offeredServiceCount: number;
}) {
  const queryClient = useQueryClient();
  const services = useQuery(activeServicesQueryOptions(branch.organizationId));
  const offerings = useQuery(branchOfferingsQueryOptions(branch.id));
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: branchSetupQueryKey(branch.id) }),
      refreshBranchData(queryClient, branch.organizationId),
    ]);

  const toggle = useMutation({
    mutationFn: async ({ serviceId, offered }: { serviceId: string; offered: boolean }) => {
      if (offered) {
        const { error } = await supabase
          .from("branch_services")
          .insert({ branch_id: branch.id, service_id: serviceId, organization_id: branch.organizationId });
        if (error) throw error;
        return;
      }
      // A published branch keeps at least one offered service (SET-10).
      if (isPublished && offeredServiceCount <= 1) throw new SetupGuardError(messages.publishGuards.lastOffering);
      const { error } = await supabase.from("branch_services").delete().eq("branch_id", branch.id).eq("service_id", serviceId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return (
    <SetupSection id="offerings-section" title={messages.branchSetup.offerings}>
      {services.isPending || offerings.isPending ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : services.isError ? (
        <QueryErrorState error={services.error} onRetry={() => void services.refetch()} />
      ) : offerings.isError ? (
        <QueryErrorState error={offerings.error} onRetry={() => void offerings.refetch()} />
      ) : services.data.length === 0 ? (
        <p className="text-muted-foreground">{messages.branchSetup.noActiveServices}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {services.data.map((service) => (
            <OfferingRow
              key={service.id}
              branchId={branch.id}
              service={service}
              offered={offerings.data.has(service.id)}
              priceOverride={offerings.data.get(service.id) ?? null}
              isToggling={toggle.isPending}
              onToggle={(offered) => toggle.mutate({ serviceId: service.id, offered })}
              onSaved={refresh}
            />
          ))}
        </ul>
      )}
      <FormErrorAlert error={toggle.error} />
    </SetupSection>
  );
}

function OfferingRow({
  branchId,
  service,
  offered,
  priceOverride,
  isToggling,
  onToggle,
  onSaved,
}: {
  branchId: string;
  service: ActiveService;
  offered: boolean;
  priceOverride: number | null;
  isToggling: boolean;
  onToggle: (offered: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const [price, setPrice] = useState(priceOverride?.toString() ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const priceId = `price-${service.id}`;
  const savePrice = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("branch_services")
        .update({ price_override: textToOptionalNumber(price) })
        .eq("branch_id", branchId)
        .eq("service_id", service.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await onSaved();
      toast.success(messages.setup.saved);
    },
  });

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-end">
      <div className="flex-1">
        <CheckboxField label={service.name} checked={offered} disabled={isToggling} onChange={onToggle} />
      </div>
      {offered ? (
        <form
          noValidate
          className="flex flex-col gap-2 md:flex-row md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const valid = price.trim() === "" || amountText({ allowZero: true }).safeParse(price).success;
            setProblem(valid ? null : messages.validation.amountZeroOrMore);
            if (valid) savePrice.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor={priceId} className="text-sm font-medium">{messages.branchSetup.priceHere}</Label>
            <Input id={priceId} type="number" inputMode="decimal" className="md:w-36" value={price}
              placeholder={formatPeso(service.price)} aria-invalid={problem ? true : undefined}
              aria-describedby={`${priceId}-hint`} onChange={(event) => setPrice(event.target.value)} />
            {problem ? (
              <p id={`${priceId}-hint`} role="alert" className="text-sm text-danger">{problem}</p>
            ) : (
              <p id={`${priceId}-hint`} className="text-xs font-medium text-muted-foreground">
                {fillTemplate(messages.branchSetup.priceHereHint, { price: formatPeso(service.price) })}
              </p>
            )}
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={savePrice.isPending}>
            {messages.setup.save}
          </Button>
        </form>
      ) : null}
      <FormErrorAlert error={savePrice.error} />
    </li>
  );
}

import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CheckboxField } from "@/components/CheckboxField";
import { FormField } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  catalogueQueryKey,
  readServiceBranchIds,
  type CatalogueService,
  type ServiceCategory,
} from "@/features/catalogue/catalogue-queries";
import { refreshBranchData } from "@/features/organization/branch-cache";
import type { OwnedBranch } from "@/features/organization/branch-queries";
import type { BranchSetupStatus } from "@/features/organization/branch-setup-status";
import { SetupGuardError } from "@/features/organization/setup-guard-error";
import { fillTemplate, messages } from "@/lib/messages";
import {
  amountText,
  percentText,
  textToNumber,
  wholeNumberText,
} from "@/lib/number-field-schemas";
import { supabase } from "@/lib/supabase-client";

const depositChoices = ["shop", "fixed", "percent"] as const;
type DepositChoice = (typeof depositChoices)[number];

const serviceSchema = z
  .object({
    categoryId: z.string().min(1, { error: messages.validation.required }),
    name: z.string().trim().min(1, { error: messages.validation.required }),
    description: z.string(),
    durationMinutes: wholeNumberText(5, 600),
    bufferMinutes: wholeNumberText(0, 120),
    price: amountText({ allowZero: true }),
    priceIsStarting: z.boolean(),
    depositChoice: z.enum(depositChoices),
    depositFixedAmount: z.string(),
    depositPercent: z.string(),
    isActive: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.depositChoice === "shop") return;
    const check = values.depositChoice === "fixed"
      ? amountText({ allowZero: false }).safeParse(values.depositFixedAmount)
      : percentText({ allowZero: false }).safeParse(values.depositPercent);
    if (!check.success) {
      context.addIssue({
        code: "custom",
        message: check.error.issues[0]?.message ?? messages.validation.required,
        path: [values.depositChoice === "fixed" ? "depositFixedAmount" : "depositPercent"],
      });
    }
  });

type ServiceValues = z.input<typeof serviceSchema>;

export function ServiceSheet({
  organizationId,
  categories,
  service,
  branches,
  statuses,
  onClose,
}: {
  organizationId: string;
  categories: ServiceCategory[];
  service: CatalogueService | null;
  branches: OwnedBranch[];
  statuses: BranchSetupStatus[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (values: ServiceValues) => {
      // A published branch keeps at least one offered service (SET-10).
      if (service?.isActive && !values.isActive) {
        const offeringBranchIds = await readServiceBranchIds(service.id);
        const lastAt = statuses.find(
          (status) => status.isPublished && status.offeredServiceCount <= 1 && offeringBranchIds.includes(status.branchId),
        );
        if (lastAt) {
          const branchName = branches.find((branch) => branch.id === lastAt.branchId)?.name ?? "";
          throw new SetupGuardError(fillTemplate(messages.publishGuards.serviceAtPublishedBranch, { branch: branchName }));
        }
      }
      const row = {
        category_id: values.categoryId,
        name: values.name.trim(),
        description: values.description.trim() || null,
        duration_minutes: textToNumber(values.durationMinutes),
        buffer_minutes: textToNumber(values.bufferMinutes),
        price: textToNumber(values.price),
        price_is_starting: values.priceIsStarting,
        deposit_type: values.depositChoice === "shop" ? null : values.depositChoice,
        deposit_fixed_amount: values.depositChoice === "fixed" ? textToNumber(values.depositFixedAmount) : null,
        deposit_percent: values.depositChoice === "percent" ? textToNumber(values.depositPercent) : null,
        is_active: values.isActive,
      };
      const { error } = service
        ? await supabase.from("services").update(row).eq("id", service.id)
        : await supabase.from("services").insert({ ...row, organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: catalogueQueryKey(organizationId) }),
        refreshBranchData(queryClient, organizationId),
      ]);
      toast.success(messages.setup.saved);
      onClose();
    },
  });

  const defaultValues: ServiceValues = {
    categoryId: service?.categoryId ?? categories[0]?.id ?? "",
    name: service?.name ?? "",
    description: service?.description ?? "",
    durationMinutes: String(service?.durationMinutes ?? 30),
    bufferMinutes: String(service?.bufferMinutes ?? 0),
    price: service ? String(service.price) : "",
    priceIsStarting: service?.priceIsStarting ?? false,
    depositChoice: service?.depositType ?? "shop",
    depositFixedAmount: service?.depositFixedAmount?.toString() ?? "",
    depositPercent: service?.depositPercent?.toString() ?? "",
    isActive: service?.isActive ?? true,
  };
  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: serviceSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <TaskSheet
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={service ? messages.catalogue.editService : messages.catalogue.addService}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="categoryId">
          {(field) => (
            <FormField id="service-category" label={messages.catalogue.category}>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger id="service-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id} className="min-h-11 text-base">
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </form.Field>
        <form.Field name="name">
          {(field) => (
            <TextField id="service-name" label={messages.catalogue.name} value={field.state.value}
              errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <TextField id="service-description" label={messages.catalogue.description} value={field.state.value}
              errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="durationMinutes">
            {(field) => (
              <TextField id="service-duration" label={messages.catalogue.duration} type="number" inputMode="numeric"
                value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
            )}
          </form.Field>
          <form.Field name="price">
            {(field) => (
              <TextField id="service-price" label={messages.catalogue.price} type="number"
                value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
            )}
          </form.Field>
        </div>
        <form.Field name="bufferMinutes">
          {(field) => (
            <TextField id="service-buffer" label={messages.catalogue.buffer} hint={messages.catalogue.bufferHint} type="number"
              inputMode="numeric" value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange}
              onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="priceIsStarting">
          {(field) => (
            <CheckboxField label={messages.catalogue.priceIsStarting} hint={messages.catalogue.priceIsStartingHint}
              checked={field.state.value} onChange={field.handleChange} />
          )}
        </form.Field>
        <form.Field name="depositChoice">
          {(field) => (
            <FormField id="service-deposit" label={messages.catalogue.depositOverride}>
              <Select value={field.state.value} onValueChange={(value) => field.handleChange(value as DepositChoice)}>
                <SelectTrigger id="service-deposit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shop" className="min-h-11 text-base">{messages.catalogue.useShopRule}</SelectItem>
                  <SelectItem value="fixed" className="min-h-11 text-base">{messages.policies.depositFixed}</SelectItem>
                  <SelectItem value="percent" className="min-h-11 text-base">{messages.policies.depositPercent}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.depositChoice}>
          {(depositChoice) =>
            depositChoice === "fixed" ? (
              <form.Field name="depositFixedAmount">
                {(field) => (
                  <TextField id="service-deposit-amount" label={messages.policies.depositAmount} type="number"
                    value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
                )}
              </form.Field>
            ) : depositChoice === "percent" ? (
              <form.Field name="depositPercent">
                {(field) => (
                  <TextField id="service-deposit-percent" label={messages.policies.depositPercentage} type="number"
                    value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
        <form.Field name="isActive">
          {(field) => <CheckboxField label={messages.catalogue.isActive} checked={field.state.value} onChange={field.handleChange} />}
        </form.Field>
        <FormErrorAlert error={save.error} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {messages.setup.save}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </TaskSheet>
  );
}

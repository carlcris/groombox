import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { refreshBranchData } from "@/features/organization/branch-cache";
import { fitsBusinessDay } from "@/features/organization/branch-hours-schema";
import { readBranchTimeRanges, type OwnedBranch } from "@/features/organization/branch-queries";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

const required = z.string().trim().min(1, { error: messages.validation.required });
const detailsSchema = z.object({
  name: required,
  address: required,
  city: required,
  area: required,
  contactNumber: z.string(),
  businessDayStart: required,
});

class BusinessDayStartConflict extends Error {}

export function BranchDetailsSheet({
  organizationId,
  branch,
  onClose,
}: {
  organizationId: string;
  branch: OwnedBranch;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (values: z.infer<typeof detailsSchema>) => {
      // Every opening and shift must still fit the business day (backend schema, branch_hours).
      if (values.businessDayStart !== branch.businessDayStart) {
        const ranges = await readBranchTimeRanges(branch.id);
        if (!ranges.every((range) => fitsBusinessDay(range, values.businessDayStart))) throw new BusinessDayStartConflict();
      }
      const { error } = await supabase
        .from("branches")
        .update({
          name: values.name.trim(),
          address: values.address.trim(),
          city: values.city.trim(),
          area: values.area.trim(),
          contact_number: values.contactNumber.trim() || null,
          business_day_start: values.businessDayStart,
        })
        .eq("id", branch.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshBranchData(queryClient, organizationId);
      toast.success(messages.setup.saved);
      onClose();
    },
  });
  const form = useForm({
    defaultValues: {
      name: branch.name,
      address: branch.address,
      city: branch.city,
      area: branch.area,
      contactNumber: branch.contactNumber,
      businessDayStart: branch.businessDayStart,
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: detailsSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={messages.branches.editBranch} description={branch.name}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <TextField id="branch-name" label={messages.onboarding.branchName} value={field.state.value}
              errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="address">
          {(field) => (
            <TextField id="branch-address" label={messages.onboarding.address} value={field.state.value}
              errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <div className="grid gap-4 md:grid-cols-2">
          <form.Field name="city">
            {(field) => (
              <TextField id="branch-city" label={messages.onboarding.city} value={field.state.value}
                errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
            )}
          </form.Field>
          <form.Field name="area">
            {(field) => (
              <TextField id="branch-area" label={messages.onboarding.area} value={field.state.value}
                errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
            )}
          </form.Field>
        </div>
        <form.Field name="contactNumber">
          {(field) => (
            <TextField id="branch-contact" label={messages.branches.contactNumber} type="tel" autoComplete="tel"
              value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="businessDayStart">
          {(field) => (
            <TextField id="branch-business-day-start" label={messages.branches.businessDayStart}
              hint={messages.branches.businessDayStartHint} type="time" value={field.state.value}
              errors={save.error instanceof BusinessDayStartConflict ? [messages.validation.businessDayStartConflict] : field.state.meta.errors}
              onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        {save.error instanceof BusinessDayStartConflict ? null : <FormErrorAlert error={save.error} />}
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

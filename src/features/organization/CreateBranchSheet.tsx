import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { refreshBranchData } from "@/features/organization/branch-cache";
import {
  defaultBusinessDayStart,
  defaultWeekHours,
  toBranchHoursPayload,
  weekHoursSchema,
  type DayHours,
} from "@/features/organization/branch-hours-schema";
import { WeekHoursEditor } from "@/features/organization/WeekHoursEditor";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

const required = z.string().trim().min(1, { error: messages.validation.required });
const createBranchSchema = z.object({
  name: required,
  address: required,
  city: required,
  area: required,
  hours: weekHoursSchema(defaultBusinessDayStart, { requireOpenDay: false }),
});

export function CreateBranchSheet({
  organizationId,
  open,
  onOpenChange,
}: {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async (values: { name: string; address: string; city: string; area: string; hours: DayHours[] }) => {
      const { error } = await supabase.rpc("create_branch", {
        p_organization_id: organizationId,
        p_branch_name: values.name.trim(),
        p_address: values.address.trim(),
        p_city: values.city.trim(),
        p_area: values.area.trim(),
        p_hours: toBranchHoursPayload(values.hours),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshBranchData(queryClient, organizationId);
      toast.success(messages.setup.saved);
      close(false);
    },
  });
  const form = useForm({
    defaultValues: { name: "", address: "", city: "", area: "", hours: defaultWeekHours() },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createBranchSchema },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value).catch(() => undefined);
    },
  });

  function close(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      form.reset();
      create.reset();
    }
  }

  return (
    <TaskSheet open={open} onOpenChange={close} title={messages.branches.addBranch}>
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
            <TextField id="new-branch-name" label={messages.onboarding.branchName} hint={messages.onboarding.branchNameHint}
              value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="address">
          {(field) => (
            <TextField id="new-branch-address" label={messages.onboarding.address} autoComplete="street-address"
              value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <div className="grid gap-4 md:grid-cols-2">
          <form.Field name="city">
            {(field) => (
              <TextField id="new-branch-city" label={messages.onboarding.city} value={field.state.value}
                errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
            )}
          </form.Field>
          <form.Field name="area">
            {(field) => (
              <TextField id="new-branch-area" label={messages.onboarding.area} value={field.state.value}
                errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
            )}
          </form.Field>
        </div>
        <h3 className="text-lg font-medium">{messages.onboarding.hoursSection}</h3>
        <form.Subscribe selector={(state) => state.submissionAttempts > 0}>
          {(submitted) => (
            <form.Field name="hours">
              {(field) => (
                <WeekHoursEditor idPrefix="new-branch" value={field.state.value} businessDayStart={defaultBusinessDayStart}
                  showProblems={submitted} onChange={field.handleChange} />
              )}
            </form.Field>
          )}
        </form.Subscribe>
        <FormErrorAlert error={create.error} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {messages.branches.addBranch}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </TaskSheet>
  );
}

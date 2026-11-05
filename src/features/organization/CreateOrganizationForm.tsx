import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { fieldIds, FormField, firstFieldError } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  defaultBusinessDayStart,
  defaultWeekHours,
  toBranchHoursPayload,
  weekHoursSchema,
} from "@/features/organization/branch-hours-schema";
import { WeekHoursEditor } from "@/features/organization/WeekHoursEditor";
import { organizationCategories, type OrganizationCategory } from "@/features/organization/organization-categories";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

const required = z.string().trim().min(1, { error: messages.validation.required });

const createOrganizationSchema = z.object({
  organizationName: required,
  category: z.enum(organizationCategories, { error: messages.validation.categoryRequired }),
  branchName: required,
  address: required,
  city: required,
  area: required,
  hours: weekHoursSchema(defaultBusinessDayStart, { requireOpenDay: false }),
});

type CreateOrganizationValues = {
  organizationName: string;
  category: OrganizationCategory | "";
  branchName: string;
  address: string;
  city: string;
  area: string;
  hours: ReturnType<typeof defaultWeekHours>;
};

export type CreatedOrganization = { organizationId: string; branchId: string };

export function CreateOrganizationForm({ onCreated }: { onCreated: (created: CreatedOrganization) => void }) {
  const createOrganization = useMutation({
    mutationFn: async (values: z.infer<typeof createOrganizationSchema>): Promise<CreatedOrganization> => {
      const { data, error } = await supabase.rpc("create_organization", {
        p_organization_name: values.organizationName.trim(),
        p_category: values.category,
        p_branch_name: values.branchName.trim(),
        p_address: values.address.trim(),
        p_city: values.city.trim(),
        p_area: values.area.trim(),
        p_hours: toBranchHoursPayload(values.hours),
      });
      if (error) throw error;
      const created = data[0];
      if (!created) throw new Error("create_organization returned no row.");
      return { organizationId: created.organization_id, branchId: created.branch_id };
    },
    onSuccess: onCreated,
  });

  const defaultValues: CreateOrganizationValues = {
    organizationName: "",
    category: "",
    branchName: "",
    address: "",
    city: "",
    area: "",
    hours: defaultWeekHours(),
  };
  const form = useForm({
    defaultValues,
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createOrganizationSchema },
    onSubmit: async ({ value }) => {
      await createOrganization.mutateAsync(createOrganizationSchema.parse(value)).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <section className="flex flex-col gap-4" aria-labelledby="organization-section">
        <h2 id="organization-section" className="text-xl font-semibold">
          {messages.onboarding.organizationSection}
        </h2>
        <form.Field name="organizationName">
          {(field) => (
            <TextField
              id="organization-name"
              label={messages.onboarding.organizationName}
              autoComplete="organization"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="category">
          {(field) => {
            const error = firstFieldError(field.state.meta.errors);
            return (
              <FormField id="category" label={messages.onboarding.category} error={error}>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as OrganizationCategory)}
                >
                  <SelectTrigger
                    id="category"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={fieldIds("category").errorId}
                  >
                    <SelectValue placeholder={messages.onboarding.category} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizationCategories.map((category) => (
                      <SelectItem key={category} value={category} className="min-h-11 text-base">
                        {messages.categories[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            );
          }}
        </form.Field>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="branch-section">
        <h2 id="branch-section" className="text-xl font-semibold">
          {messages.onboarding.branchSection}
        </h2>
        <form.Field name="branchName">
          {(field) => (
            <TextField
              id="branch-name"
              label={messages.onboarding.branchName}
              hint={messages.onboarding.branchNameHint}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="address">
          {(field) => (
            <TextField
              id="address"
              label={messages.onboarding.address}
              autoComplete="street-address"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <div className="grid gap-4 md:grid-cols-2">
          <form.Field name="city">
            {(field) => (
              <TextField
                id="city"
                label={messages.onboarding.city}
                autoComplete="address-level2"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="area">
            {(field) => (
              <TextField
                id="area"
                label={messages.onboarding.area}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="hours-section">
        <div className="flex flex-col gap-1">
          <h2 id="hours-section" className="text-xl font-semibold">
            {messages.onboarding.hoursSection}
          </h2>
          <p className="text-sm text-muted-foreground">{messages.onboarding.hoursIntro}</p>
        </div>
        <form.Subscribe selector={(state) => state.submissionAttempts > 0}>
          {(submitted) => (
            <form.Field name="hours">
              {(field) => (
                <WeekHoursEditor
                  idPrefix="onboarding"
                  value={field.state.value}
                  businessDayStart={defaultBusinessDayStart}
                  showProblems={submitted}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>
      </section>

      <FormErrorAlert error={createOrganization.error} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {messages.onboarding.submit}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { fieldIds, FormField, firstFieldError } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  dayHoursSchema,
  defaultBusinessDayStart,
  defaultWeekHours,
  toBranchHoursPayload,
  weekdayDisplayOrder,
} from "@/features/organization/branch-hours-schema";
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
  hours: z.array(dayHoursSchema(defaultBusinessDayStart)),
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
        <ul className="flex flex-col gap-3">
          {weekdayDisplayOrder.map((dayOfWeek) => (
            <li key={dayOfWeek} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
              <form.Subscribe selector={(state) => state.values.hours[dayOfWeek]?.isClosed ?? false}>
                {(isClosed) => (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-medium">{messages.hours.days[dayOfWeek]}</h3>
                      <form.Field name={`hours[${dayOfWeek}].isClosed`}>
                        {(field) => (
                          <Label className="flex min-h-11 items-center gap-2 text-base font-normal">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) => field.handleChange(checked === true)}
                            />
                            {messages.hours.closed}
                          </Label>
                        )}
                      </form.Field>
                    </div>
                    {isClosed ? null : (
                      <div className="grid grid-cols-2 gap-3">
                        <form.Field name={`hours[${dayOfWeek}].opensAt`}>
                          {(field) => {
                            const id = `opens-${dayOfWeek}`;
                            const error = firstFieldError(field.state.meta.errors);
                            return (
                              <FormField id={id} label={messages.hours.opens} error={error}>
                                <Input
                                  id={id}
                                  type="time"
                                  value={field.state.value}
                                  aria-invalid={error ? true : undefined}
                                  aria-describedby={fieldIds(id).errorId}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  onBlur={field.handleBlur}
                                />
                              </FormField>
                            );
                          }}
                        </form.Field>
                        <form.Field name={`hours[${dayOfWeek}].closesAt`}>
                          {(field) => {
                            const id = `closes-${dayOfWeek}`;
                            const error = firstFieldError(field.state.meta.errors);
                            return (
                              <FormField id={id} label={messages.hours.closes} error={error}>
                                <Input
                                  id={id}
                                  type="time"
                                  value={field.state.value}
                                  aria-invalid={error ? true : undefined}
                                  aria-describedby={fieldIds(id).errorId}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  onBlur={field.handleBlur}
                                />
                              </FormField>
                            );
                          }}
                        </form.Field>
                        <form.Field name={`hours[${dayOfWeek}].closesNextDay`}>
                          {(field) => (
                            <Label className="col-span-2 flex min-h-11 items-center gap-2 text-base font-normal">
                              <Checkbox
                                checked={field.state.value}
                                onCheckedChange={(checked) => field.handleChange(checked === true)}
                              />
                              {messages.hours.closesNextDay}
                            </Label>
                          )}
                        </form.Field>
                      </div>
                    )}
                  </>
                )}
              </form.Subscribe>
            </li>
          ))}
        </ul>
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

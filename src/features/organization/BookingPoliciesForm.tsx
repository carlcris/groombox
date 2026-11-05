import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CheckboxField } from "@/components/CheckboxField";
import { FormField } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { SetupSection } from "@/components/SetupSection";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  organizationSettingsQueryKey,
  type DepositType,
  type OrganizationSettings,
} from "@/features/organization/organization-settings-queries";
import { formatMinutes } from "@/lib/duration-formatting";
import { messages } from "@/lib/messages";
import { amountText, percentText, textToNumber, wholeNumberText } from "@/lib/number-field-schemas";
import { supabase } from "@/lib/supabase-client";

const slotIntervalChoices = [5, 10, 15, 20, 30, 60];
const minNoticeChoices = [0, 30, 60, 120, 240, 720, 1440];

const policiesSchema = z
  .object({
    depositType: z.enum(["fixed", "percent"]),
    depositFixedAmount: z.string(),
    depositPercent: z.string(),
    holdMinutes: wholeNumberText(5, 120),
    reviewHours: wholeNumberText(1, 72),
    slotIntervalMinutes: z.string(),
    minNoticeMinutes: z.string(),
    bookingHorizonDays: wholeNumberText(1, 365),
    cancellationPolicy: z.string(),
    isListed: z.boolean(),
  })
  .superRefine((values, context) => {
    const check = values.depositType === "fixed"
      ? amountText({ allowZero: false }).safeParse(values.depositFixedAmount)
      : percentText({ allowZero: false }).safeParse(values.depositPercent);
    if (!check.success) {
      context.addIssue({
        code: "custom",
        message: check.error.issues[0]?.message ?? messages.validation.required,
        path: [values.depositType === "fixed" ? "depositFixedAmount" : "depositPercent"],
      });
    }
  });

type PoliciesValues = z.input<typeof policiesSchema>;

function SelectField({
  id,
  label,
  value,
  choices,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value} className="min-h-11 text-base">
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

export function BookingPoliciesForm({ settings }: { settings: OrganizationSettings }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (values: PoliciesValues) => {
      const isFixed = values.depositType === "fixed";
      const { error } = await supabase
        .from("organizations")
        .update({
          deposit_type: values.depositType,
          deposit_fixed_amount: isFixed ? textToNumber(values.depositFixedAmount) : null,
          deposit_percent: isFixed ? null : textToNumber(values.depositPercent),
          hold_minutes: textToNumber(values.holdMinutes),
          review_hours: textToNumber(values.reviewHours),
          slot_interval_minutes: textToNumber(values.slotIntervalMinutes),
          min_notice_minutes: textToNumber(values.minNoticeMinutes),
          booking_horizon_days: textToNumber(values.bookingHorizonDays),
          cancellation_policy: values.cancellationPolicy.trim() || null,
          is_listed: values.isListed,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: organizationSettingsQueryKey(settings.id) });
      toast.success(messages.setup.saved);
    },
  });

  const defaultValues: PoliciesValues = {
    depositType: settings.depositType,
    depositFixedAmount: settings.depositFixedAmount?.toString() ?? "",
    depositPercent: settings.depositPercent?.toString() ?? "",
    holdMinutes: String(settings.holdMinutes),
    reviewHours: String(settings.reviewHours),
    slotIntervalMinutes: String(settings.slotIntervalMinutes),
    minNoticeMinutes: String(settings.minNoticeMinutes),
    bookingHorizonDays: String(settings.bookingHorizonDays),
    cancellationPolicy: settings.cancellationPolicy ?? "",
    isListed: settings.isListed,
  };
  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: policiesSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
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
      <SetupSection id="deposit-section" title={messages.policies.depositSection} intro={messages.policies.depositHint}>
        <form.Field name="depositType">
          {(field) => (
            <SelectField
              id="deposit-type"
              label={messages.policies.depositRule}
              value={field.state.value}
              choices={[
                { value: "fixed", label: messages.policies.depositFixed },
                { value: "percent", label: messages.policies.depositPercent },
              ]}
              onChange={(value) => field.handleChange(value as DepositType)}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.depositType}>
          {(depositType) =>
            depositType === "fixed" ? (
              <form.Field name="depositFixedAmount">
                {(field) => (
                  <TextField
                    id="deposit-amount"
                    label={messages.policies.depositAmount}
                    type="number"
                    value={field.state.value}
                    errors={field.state.meta.errors}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            ) : (
              <form.Field name="depositPercent">
                {(field) => (
                  <TextField
                    id="deposit-percent"
                    label={messages.policies.depositPercentage}
                    type="number"
                    value={field.state.value}
                    errors={field.state.meta.errors}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            )
          }
        </form.Subscribe>
      </SetupSection>

      <SetupSection id="times-section" title={messages.policies.timesSection}>
        <div className="grid gap-4 md:grid-cols-2">
          <form.Field name="holdMinutes">
            {(field) => (
              <TextField
                id="hold-minutes"
                label={messages.policies.holdMinutes}
                hint={messages.policies.holdHint}
                type="number"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="reviewHours">
            {(field) => (
              <TextField
                id="review-hours"
                label={messages.policies.reviewHours}
                hint={messages.policies.reviewHint}
                type="number"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </div>
      </SetupSection>

      <SetupSection id="window-section" title={messages.policies.windowSection}>
        <div className="grid gap-4 md:grid-cols-3">
          <form.Field name="slotIntervalMinutes">
            {(field) => (
              <SelectField
                id="slot-interval"
                label={messages.policies.slotInterval}
                value={field.state.value}
                choices={slotIntervalChoices.map((minutes) => ({ value: String(minutes), label: formatMinutes(minutes) }))}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="minNoticeMinutes">
            {(field) => (
              <SelectField
                id="min-notice"
                label={messages.policies.minNotice}
                value={field.state.value}
                choices={minNoticeChoices.map((minutes) => ({
                  value: String(minutes),
                  label: minutes === 0 ? messages.policies.noMinimum : formatMinutes(minutes),
                }))}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="bookingHorizonDays">
            {(field) => (
              <TextField
                id="booking-horizon"
                label={messages.policies.horizon}
                type="number"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </div>
      </SetupSection>

      <SetupSection id="cancellation-section" title={messages.policies.cancellationPolicy}>
        <form.Field name="cancellationPolicy">
          {(field) => (
            <FormField id="cancellation-policy" label={messages.policies.cancellationPolicy} hint={messages.policies.cancellationHint}>
              <textarea
                id="cancellation-policy"
                rows={4}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="isListed">
          {(field) => (
            <CheckboxField label={messages.policies.listing} checked={field.state.value} onChange={field.handleChange} />
          )}
        </form.Field>
      </SetupSection>

      <FormErrorAlert error={save.error} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting} className="md:self-start">
            {messages.setup.save}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

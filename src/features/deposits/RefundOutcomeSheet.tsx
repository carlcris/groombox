import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CheckboxField } from "@/components/CheckboxField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import type { DepositBooking } from "@/features/deposits/deposit-queries";
import { messages } from "@/lib/messages";
import { amountText, textToNumber } from "@/lib/number-field-schemas";
import { supabase } from "@/lib/supabase-client";

const refundSchema = z.object({
  refunded: z.boolean(),
  amount: amountText({ allowZero: true }),
  note: z.string(),
});

// A refund settled outside GroomBox, recorded on the booking (DEP-7).
export function RefundOutcomeSheet({ booking, onClose }: { booking: DepositBooking; onClose: () => void }) {
  const record = useMutation({
    mutationFn: async (value: z.infer<typeof refundSchema>) => {
      const { error } = await supabase.rpc("record_refund_outcome", {
        p_booking_id: booking.id,
        p_refunded: value.refunded,
        p_amount: value.refunded ? textToNumber(value.amount) : 0,
        p_note: value.note.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(messages.deposits.refundRecorded);
      onClose();
    },
  });
  const form = useForm({
    defaultValues: { refunded: true, amount: booking.depositAmount.toFixed(2), note: "" },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: refundSchema },
    onSubmit: async ({ value }) => {
      await record.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={messages.deposits.refundTitle} description={booking.clientName}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="refunded">
          {(field) => (
            <div className="flex flex-col gap-1">
              <CheckboxField label={messages.deposits.refunded} checked={field.state.value} onChange={field.handleChange} />
              <CheckboxField label={messages.deposits.notRefunded} checked={!field.state.value} onChange={(checked) => field.handleChange(!checked)} />
            </div>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.refunded}>
          {(refunded) =>
            refunded ? (
              <form.Field name="amount">
                {(field) => (
                  <TextField
                    id="refund-amount"
                    label={messages.deposits.refundAmount}
                    type="number"
                    value={field.state.value}
                    errors={field.state.meta.errors}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
        <form.Field name="note">
          {(field) => (
            <TextField
              id="refund-note"
              label={messages.deposits.refundNote}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <FormErrorAlert error={record.error} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {messages.deposits.recordRefund}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </TaskSheet>
  );
}

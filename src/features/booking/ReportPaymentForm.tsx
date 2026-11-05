import { useState } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { FormField } from "@/components/FormField";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BookingView, PaymentMethod } from "@/features/booking/booking-link-queries";
import { fillTemplate, messages } from "@/lib/messages";
import { amountText, textToNumber } from "@/lib/number-field-schemas";
import { uploadImage } from "@/lib/stored-images";
import { supabase } from "@/lib/supabase-client";

// The ways a client pays a deposit; cash and card are for checkout at the shop.
const reportableMethods = ["gcash", "maya", "bank_transfer", "other"] as const satisfies readonly PaymentMethod[];
type ReportableMethod = (typeof reportableMethods)[number];

const reportSchema = z.object({
  referenceNumber: z.string().trim().min(1, { error: messages.validation.required }),
  amountPaid: amountText({ allowZero: false }),
  method: z.enum(reportableMethods),
  note: z.string(),
});

function defaultMethod(booking: BookingView): ReportableMethod {
  const method = booking.paymentDetails?.method;
  return reportableMethods.find((candidate) => candidate === method) ?? "gcash";
}

// The client reports paying the amount due: reference number, amount, and method, with an optional
// screenshot (DEP-2). The screenshot goes to the private bucket under the booking's folder first;
// the report then names it.
export function ReportPaymentForm({ booking, onReported }: { booking: BookingView; onReported: () => void }) {
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const report = useMutation({
    mutationFn: async (value: z.infer<typeof reportSchema>) => {
      const proofPath = screenshot
        ? await uploadImage("payment-proofs", `${booking.organizationId}/${booking.bookingId}`, screenshot)
        : undefined;
      const { error } = await supabase.rpc("submit_payment_proof", {
        p_booking_id: booking.bookingId,
        p_reference_number: value.referenceNumber.trim(),
        p_amount_paid: textToNumber(value.amountPaid),
        p_method: value.method,
        p_proof_path: proofPath,
        p_note: value.note.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(messages.bookingPage.reported);
      onReported();
    },
    // A refusal means the booking changed (the hold ran out, or it was already reported), so the
    // page asks for it again to show where it stands.
    onError: onReported,
  });
  const form = useForm({
    defaultValues: {
      referenceNumber: "",
      amountPaid: booking.amountDue.toFixed(2),
      method: defaultMethod(booking),
      note: "",
    },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: reportSchema },
    onSubmit: async ({ value }) => {
      await report.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="referenceNumber">
        {(field) => (
          <TextField
            id="reference-number"
            label={messages.bookingPage.referenceNumber}
            hint={messages.bookingPage.referenceHint}
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="amountPaid">
        {(field) => (
          <TextField
            id="amount-paid"
            label={messages.bookingPage.amountPaid}
            type="number"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="method">
        {(field) => (
          <FormField id="payment-method" label={messages.bookingPage.paymentMethod}>
            <Select value={field.state.value} onValueChange={(method) => field.handleChange(method as ReportableMethod)}>
              <SelectTrigger id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reportableMethods.map((method) => (
                  <SelectItem key={method} value={method} className="min-h-11 text-base">
                    {messages.paymentMethods[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      </form.Field>
      <div className="flex flex-col gap-2">
        <span className="text-base font-medium">{messages.bookingPage.screenshot}</span>
        {screenshot ? (
          <p className="text-sm text-muted-foreground">{fillTemplate(messages.bookingPage.screenshotChosen, { name: screenshot.name })}</p>
        ) : null}
        <ImageUploadButton
          label={screenshot ? messages.bookingPage.replaceScreenshot : messages.bookingPage.addScreenshot}
          isUploading={false}
          onImage={setScreenshot}
        />
      </div>
      <form.Field name="note">
        {(field) => (
          <TextField
            id="report-note"
            label={messages.bookingPage.noteForShop}
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <FormErrorAlert error={report.error} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {messages.bookingPage.submitReport}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { refreshBranchData } from "@/features/organization/branch-cache";
import {
  branchPaymentMethods,
  toPaymentInstructions,
  type BranchPaymentDetails,
  type BranchPaymentMethod,
  type OwnedBranch,
} from "@/features/organization/branch-queries";
import { messages } from "@/lib/messages";
import { useImageReplacement } from "@/hooks/useImageReplacement";
import { publicImageUrl } from "@/lib/stored-images";
import { supabase } from "@/lib/supabase-client";

const required = z.string().trim().min(1, { error: messages.validation.required });
// All four parts are required every time, so a published branch never loses its payment details.
const paymentSchema = z.object({
  method: z.enum(branchPaymentMethods),
  accountName: required,
  accountNumber: required,
  qrPath: z.string().min(1, { error: messages.validation.qrRequired }),
});

export function PaymentDetailsSheet({
  organizationId,
  branch,
  onClose,
}: {
  organizationId: string;
  branch: OwnedBranch;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const savedQrPath = branch.paymentDetails?.qrPath ?? "";
  const qrImage = useImageReplacement("payment-qr", savedQrPath || null, `${organizationId}/${branch.id}`);

  const save = useMutation({
    mutationFn: async (details: BranchPaymentDetails) => {
      const { error } = await supabase
        .from("branches")
        .update({ payment_instructions: toPaymentInstructions(details) })
        .eq("id", branch.id);
      if (error) throw error;
      await qrImage.removeUnused(details.qrPath);
    },
    onSuccess: async () => {
      await refreshBranchData(queryClient, organizationId);
      toast.success(messages.setup.saved);
      onClose();
    },
  });

  const defaultValues: { method: BranchPaymentMethod; accountName: string; accountNumber: string; qrPath: string } = {
    method: branch.paymentDetails?.method ?? "gcash",
    accountName: branch.paymentDetails?.accountName ?? "",
    accountNumber: branch.paymentDetails?.accountNumber ?? "",
    qrPath: savedQrPath,
  };
  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: paymentSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  function discardAndClose() {
    qrImage.discardUploads();
    onClose();
  }

  return (
    <TaskSheet
      open
      onOpenChange={(open) => (open ? null : discardAndClose())}
      title={messages.branches.paymentDetails}
      description={messages.branches.paymentDetailsIntro}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="method">
          {(field) => (
            <FormField id="payment-method" label={messages.branches.paymentMethod}>
              <Select value={field.state.value} onValueChange={(value) => field.handleChange(value as BranchPaymentMethod)}>
                <SelectTrigger id="payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branchPaymentMethods.map((method) => (
                    <SelectItem key={method} value={method} className="min-h-11 text-base">
                      {messages.branches.methods[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </form.Field>
        <form.Field name="accountName">
          {(field) => (
            <TextField id="account-name" label={messages.branches.accountName} value={field.state.value}
              errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="accountNumber">
          {(field) => (
            <TextField id="account-number" label={messages.branches.accountNumber} inputMode="numeric"
              value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="qrPath">
          {(field) => {
            const problem = field.state.meta.errors.length > 0 ? messages.validation.qrRequired : undefined;
            return (
              <div className="flex flex-col gap-3">
                <span className="text-base font-medium">{messages.branches.qrImage}</span>
                {field.state.value ? (
                  <img
                    src={publicImageUrl("payment-qr", field.state.value)}
                    alt={messages.branches.qrImage}
                    className="size-40 rounded-lg border object-contain"
                  />
                ) : null}
                <ImageUploadButton
                  label={messages.branches.uploadQr}
                  isUploading={qrImage.upload.isPending}
                  onImage={(file) => qrImage.upload.mutate(file, { onSuccess: (path) => field.handleChange(path) })}
                />
                {problem ? (
                  <p role="alert" className="text-sm text-danger">
                    {problem}
                  </p>
                ) : null}
                <FormErrorAlert error={qrImage.upload.error} />
              </div>
            );
          }}
        </form.Field>
        <FormErrorAlert error={save.error} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting || qrImage.upload.isPending}>
              {messages.setup.save}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </TaskSheet>
  );
}

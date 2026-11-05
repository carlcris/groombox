import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { clientsQueryKey, type ClientSummary } from "@/features/clients/client-queries";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

const clientSchema = z.object({
  fullName: z.string().trim().min(1, { error: messages.validation.required }),
  mobileNumber: z.string(),
  notes: z.string(),
});

// The owner or a manager edits a client's name, number, and private notes: a single-row write the
// clients audit trigger logs.
export function ClientEditSheet({
  organizationId,
  client,
  notes,
  onClose,
}: {
  organizationId: string;
  client: ClientSummary;
  notes: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (value: z.infer<typeof clientSchema>) => {
      const { error } = await supabase
        .from("clients")
        .update({ full_name: value.fullName.trim(), mobile_number: value.mobileNumber.trim() || null, notes: value.notes.trim() || null })
        .eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientsQueryKey(organizationId) });
      toast.success(messages.clients.saved);
      onClose();
    },
  });
  const form = useForm({
    defaultValues: { fullName: client.fullName, mobileNumber: client.mobileNumber ?? "", notes },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: clientSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={messages.clients.editTitle}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="fullName">
          {(field) => (
            <TextField
              id="client-full-name"
              label={messages.floor.clientName}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="mobileNumber">
          {(field) => (
            <TextField
              id="client-mobile-number"
              label={messages.clients.mobile}
              type="tel"
              inputMode="tel"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <TextField
              id="client-notes"
              label={messages.clients.notes}
              hint={messages.clients.notesHint}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <FormErrorAlert error={save.error} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {messages.floor.save}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </TaskSheet>
  );
}

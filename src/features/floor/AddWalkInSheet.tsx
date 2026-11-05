import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { firstFieldError } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { branchStaffQueryOptions } from "@/features/branch-setup/branch-setup-queries";
import { ClientPicker, clientArguments, type ClientChoice } from "@/features/floor/ClientPicker";
import { ServiceChecklist } from "@/features/floor/ServiceChecklist";
import { StaffSelectField } from "@/features/floor/StaffSelectField";
import { branchServiceOptionsQueryOptions, visitsQueryKey } from "@/features/floor/visit-queries";
import { walkInSchema } from "@/features/floor/visit-schemas";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

// A walk-in joins the queue with a queue number (app flow §7).
export function AddWalkInSheet({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const services = useQuery(branchServiceOptionsQueryOptions(branchId));
  const staff = useQuery(branchStaffQueryOptions(branchId));
  const add = useMutation({
    mutationFn: async (value: { client: ClientChoice; serviceIds: string[]; staffId: string | null }) => {
      const { error } = await supabase.rpc("add_walk_in", {
        p_branch_id: branchId,
        p_service_ids: value.serviceIds,
        p_staff_id: value.staffId ?? undefined,
        ...clientArguments(value.client),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: visitsQueryKey(branchId) });
      toast.success(messages.floor.walkInAdded);
      onClose();
    },
  });
  const form = useForm({
    defaultValues: { client: null as ClientChoice | null, serviceIds: [] as string[], staffId: null as string | null },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: walkInSchema },
    onSubmit: async ({ value }) => {
      if (!value.client) return;
      await add.mutateAsync({ ...value, client: value.client }).catch(() => undefined);
    },
  });

  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={messages.floor.walkInTitle}>
      {services.isPending || staff.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="client">
            {(field) => (
              <ClientPicker branchId={branchId} value={field.state.value} onChange={field.handleChange} error={firstFieldError(field.state.meta.errors)} />
            )}
          </form.Field>
          <form.Field name="serviceIds">
            {(field) => (
              <ServiceChecklist
                services={services.data ?? []}
                selectedIds={field.state.value}
                onChange={field.handleChange}
                error={firstFieldError(field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="staffId">
            {(field) => (
              <StaffSelectField
                id="walk-in-staff"
                label={messages.floor.staffPreference}
                staff={staff.data ?? []}
                value={field.state.value}
                emptyLabel={messages.floor.noPreference}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <FormErrorAlert error={add.error} />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {messages.floor.addToQueue}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </TaskSheet>
  );
}

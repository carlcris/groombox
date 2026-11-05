import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { firstFieldError } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { branchStaffQueryOptions } from "@/features/branch-setup/branch-setup-queries";
import { ClientPicker, clientArguments, type ClientChoice } from "@/features/floor/ClientPicker";
import { ServiceChecklist } from "@/features/floor/ServiceChecklist";
import { StaffSelectField } from "@/features/floor/StaffSelectField";
import { branchServiceOptionsQueryOptions, visitsQueryKey } from "@/features/floor/visit-queries";
import { appointmentSchema } from "@/features/floor/visit-schemas";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { branchLocalToIso } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

// An appointment the shop enters for a client: confirmed straight away, with no deposit and no fee
// (BKG-7). The database refuses a time that overlaps the staff member's other bookings.
export function AppointmentSheet({ branch, date, onClose }: { branch: WorkBranch; date: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const services = useQuery(branchServiceOptionsQueryOptions(branch.id));
  const staff = useQuery(branchStaffQueryOptions(branch.id));
  const create = useMutation({
    mutationFn: async (value: { client: ClientChoice; serviceIds: string[]; staffId: string; date: string; time: string }) => {
      const { error } = await supabase.rpc("create_staff_booking", {
        p_branch_id: branch.id,
        p_service_ids: value.serviceIds,
        p_start_at: branchLocalToIso(`${value.date}T${value.time}`, branch.timezone),
        p_staff_id: value.staffId,
        ...clientArguments(value.client),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: visitsQueryKey(branch.id) });
      toast.success(messages.floor.appointmentAdded);
      onClose();
    },
  });
  const form = useForm({
    defaultValues: {
      client: null as ClientChoice | null,
      serviceIds: [] as string[],
      staffId: null as string | null,
      date,
      time: "",
    },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: appointmentSchema },
    onSubmit: async ({ value }) => {
      if (!value.client || !value.staffId) return;
      await create.mutateAsync({ ...value, client: value.client, staffId: value.staffId }).catch(() => undefined);
    },
  });

  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={messages.floor.appointmentTitle}>
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
              <ClientPicker branchId={branch.id} value={field.state.value} onChange={field.handleChange} error={firstFieldError(field.state.meta.errors)} />
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
                id="appointment-staff"
                label={messages.floor.staff}
                staff={staff.data ?? []}
                value={field.state.value}
                error={firstFieldError(field.state.meta.errors)}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <div className="grid grid-cols-2 gap-3">
            <form.Field name="date">
              {(field) => (
                <TextField
                  id="appointment-date"
                  label={messages.floor.date}
                  type="date"
                  value={field.state.value}
                  errors={field.state.meta.errors}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
            <form.Field name="time">
              {(field) => (
                <TextField
                  id="appointment-time"
                  label={messages.floor.time}
                  type="time"
                  value={field.state.value}
                  errors={field.state.meta.errors}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </div>
          <FormErrorAlert error={create.error} />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {messages.floor.addAppointment}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </TaskSheet>
  );
}

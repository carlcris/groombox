import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CheckboxField } from "@/components/CheckboxField";
import { FormField } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActiveService } from "@/features/catalogue/catalogue-queries";
import { refreshBranchData } from "@/features/organization/branch-cache";
import type { OwnedBranch } from "@/features/organization/branch-queries";
import type { BranchSetupStatus } from "@/features/organization/branch-setup-status";
import { SetupGuardError } from "@/features/organization/setup-guard-error";
import { readStaffShiftBranchIds, staffQueryKey, type LinkableMember, type StaffProfile } from "@/features/staff/staff-queries";
import { BranchChoiceField } from "@/features/team/BranchChoiceField";
import { useImageReplacement } from "@/hooks/useImageReplacement";
import { fillTemplate, messages } from "@/lib/messages";
import { optional, percentText, textToNumber, textToOptionalNumber } from "@/lib/number-field-schemas";
import { publicImageUrl } from "@/lib/stored-images";
import { supabase } from "@/lib/supabase-client";

const noLogin = "none";

const staffSchema = z.object({
  displayName: z.string().trim().min(1, { error: messages.validation.required }),
  title: z.string(),
  photoPath: z.string(),
  commission: percentText({ allowZero: true }),
  isBookable: z.boolean(),
  isActive: z.boolean(),
  memberId: z.string(),
  branchIds: z.array(z.string()),
  serviceIds: z.array(z.string()),
  overrides: z.record(z.string(), optional(percentText({ allowZero: true }))),
});

type StaffValues = z.input<typeof staffSchema>;

export function StaffProfileSheet({
  organizationId,
  staff,
  branches,
  services,
  members,
  statuses,
  onClose,
}: {
  organizationId: string;
  staff: StaffProfile | null;
  branches: OwnedBranch[];
  services: ActiveService[];
  members: LinkableMember[];
  statuses: BranchSetupStatus[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const photo = useImageReplacement("shop-media", staff?.photoPath ?? null, `${organizationId}/staff/${staff?.id ?? ""}`);

  const save = useMutation({
    mutationFn: async (values: StaffValues) => {
      // A published branch keeps at least one bookable staff member with a shift (SET-10).
      if (staff?.isBookable && staff.isActive) {
        const shiftBranchIds = await readStaffShiftBranchIds(staff.id);
        const losing = (branchId: string) => !values.isBookable || !values.isActive || !values.branchIds.includes(branchId);
        const lastAt = statuses.find(
          (status) =>
            status.isPublished &&
            status.bookableStaffWithShiftCount <= 1 &&
            shiftBranchIds.includes(status.branchId) &&
            losing(status.branchId),
        );
        if (lastAt) {
          const branchName = branches.find((branch) => branch.id === lastAt.branchId)?.name ?? "";
          throw new SetupGuardError(
            fillTemplate(messages.publishGuards.staffAtPublishedBranch, { name: staff.displayName, branch: branchName }),
          );
        }
      }
      const { error } = await supabase.rpc("save_staff_profile", {
        p_organization_id: organizationId,
        p_staff_id: staff?.id,
        p_display_name: values.displayName.trim(),
        p_title: values.title.trim() || undefined,
        p_photo_path: values.photoPath || undefined,
        p_commission_percent: textToNumber(values.commission),
        p_is_bookable: values.isBookable,
        p_is_active: values.isActive,
        p_member_id: values.memberId === noLogin ? undefined : values.memberId,
        p_branch_ids: values.branchIds,
        p_services: values.serviceIds.map((serviceId) => ({
          service_id: serviceId,
          commission_percent_override: textToOptionalNumber(values.overrides[serviceId] ?? ""),
        })),
      });
      if (error) throw error;
      await photo.removeUnused(values.photoPath || null);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: staffQueryKey(organizationId) }),
        refreshBranchData(queryClient, organizationId),
      ]);
      toast.success(messages.setup.saved);
      onClose();
    },
  });

  const defaultValues: StaffValues = {
    displayName: staff?.displayName ?? "",
    title: staff?.title ?? "",
    photoPath: staff?.photoPath ?? "",
    commission: String(staff?.commissionPercent ?? 0),
    isBookable: staff?.isBookable ?? true,
    isActive: staff?.isActive ?? true,
    memberId: staff?.memberId ?? noLogin,
    branchIds: staff?.branchIds ?? (branches.length === 1 && branches[0] ? [branches[0].id] : []),
    serviceIds: staff?.services.map((assignment) => assignment.serviceId) ?? [],
    overrides: Object.fromEntries(
      (staff?.services ?? []).map((assignment) => [assignment.serviceId, assignment.commissionPercentOverride?.toString() ?? ""]),
    ),
  };
  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: staffSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  const availableMembers = members.filter((member) => !member.linkedStaffId || member.linkedStaffId === staff?.id);

  return (
    <TaskSheet
      open
      onOpenChange={(open) => {
        if (open) return;
        photo.discardUploads();
        onClose();
      }}
      title={staff ? messages.staff.editStaff : messages.staff.addStaff}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="displayName">
          {(field) => (
            <TextField id="staff-name" label={messages.staff.displayName} value={field.state.value}
              errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="title">
          {(field) => (
            <TextField id="staff-title" label={messages.staff.jobTitle} hint={messages.staff.jobTitleHint}
              value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} onBlur={field.handleBlur} />
          )}
        </form.Field>
        {staff ? (
          <form.Field name="photoPath">
            {(field) => (
              <div className="flex flex-col gap-3">
                <span className="text-base font-medium">{messages.staff.photo}</span>
                {field.state.value ? (
                  <img src={publicImageUrl("shop-media", field.state.value)} alt={messages.staff.photo}
                    className="size-24 rounded-full border object-cover" />
                ) : null}
                <ImageUploadButton
                  label={messages.staff.uploadPhoto}
                  isUploading={photo.upload.isPending}
                  onImage={(file) => photo.upload.mutate(file, { onSuccess: (path) => field.handleChange(path) })}
                />
                <FormErrorAlert error={photo.upload.error} />
              </div>
            )}
          </form.Field>
        ) : null}
        <form.Field name="commission">
          {(field) => (
            <TextField id="staff-commission" label={messages.staff.commission} hint={messages.staff.commissionHint}
              type="number" value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange}
              onBlur={field.handleBlur} />
          )}
        </form.Field>
        <form.Field name="isBookable">
          {(field) => <CheckboxField label={messages.staff.isBookable} checked={field.state.value} onChange={field.handleChange} />}
        </form.Field>
        <form.Field name="isActive">
          {(field) => <CheckboxField label={messages.staff.isActive} checked={field.state.value} onChange={field.handleChange} />}
        </form.Field>
        <form.Field name="branchIds">
          {(field) => (
            <BranchChoiceField id="staff-branches" branches={branches}
              value={field.state.value} errors={field.state.meta.errors} onChange={field.handleChange} />
          )}
        </form.Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-medium">{messages.staff.services}</legend>
          <form.Subscribe selector={(state) => ({ serviceIds: state.values.serviceIds, overrides: state.values.overrides })}>
            {({ serviceIds, overrides }) =>
              services.map((service) => {
                const selected = serviceIds.includes(service.id);
                const overrideId = `override-${service.id}`;
                return (
                  <div key={service.id} className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="flex-1">
                      <CheckboxField
                        label={service.name}
                        checked={selected}
                        onChange={(checked) =>
                          form.setFieldValue(
                            "serviceIds",
                            checked ? [...serviceIds, service.id] : serviceIds.filter((serviceId) => serviceId !== service.id),
                          )
                        }
                      />
                    </div>
                    {selected ? (
                      <form.Field name={`overrides.${service.id}`}>
                        {(field) => (
                          <FormField id={overrideId} label={messages.staff.commissionOverride}
                            error={field.state.meta.errors.length > 0 ? messages.validation.percentRange : undefined}>
                            <Input id={overrideId} type="number" inputMode="decimal" className="md:w-32"
                              placeholder={messages.staff.commissionOverrideHint} value={overrides[service.id] ?? ""}
                              onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
                          </FormField>
                        )}
                      </form.Field>
                    ) : null}
                  </div>
                );
              })
            }
          </form.Subscribe>
        </fieldset>
        <form.Field name="memberId">
          {(field) => (
            <FormField id="staff-login" label={messages.staff.linkedLogin} hint={messages.staff.linkedLoginHint}>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger id="staff-login">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={noLogin} className="min-h-11 text-base">{messages.staff.noLogin}</SelectItem>
                  {availableMembers.map((member) => (
                    <SelectItem key={member.memberId} value={member.memberId} className="min-h-11 text-base">
                      {member.fullName ?? messages.team.unnamed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </form.Field>
        <FormErrorAlert error={save.error} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting || photo.upload.isPending}>
              {messages.setup.save}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </TaskSheet>
  );
}

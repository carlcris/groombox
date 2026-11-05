import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { BranchChoiceField } from "@/features/team/BranchChoiceField";
import { memberAssignmentSchema, type AssignableRole } from "@/features/team/member-schemas";
import { RoleField } from "@/features/team/RoleField";
import { teamQueryKey, updateMember, type TeamMember } from "@/features/team/team-queries";
import { messages } from "@/lib/messages";

export function EditMemberSheet({
  organizationId,
  member,
  role,
  branches,
  onClose,
}: {
  organizationId: string;
  member: TeamMember;
  role: AssignableRole;
  branches: WorkBranch[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: updateMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamQueryKey(organizationId) });
      toast.success(messages.team.memberUpdated);
      onClose();
    },
  });
  const form = useForm({
    defaultValues: { role, branchIds: member.branchIds, canReviewDeposits: member.canReviewDeposits },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: memberAssignmentSchema },
    onSubmit: async ({ value }) => {
      await update
        .mutateAsync({
          memberId: member.id,
          role: value.role,
          branchIds: value.branchIds,
          // Managers review deposits by role; the permission applies to staff only.
          canReviewDeposits: value.role === "staff" && value.canReviewDeposits,
        })
        .catch(() => undefined);
    },
  });

  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={messages.team.editTitle} description={member.fullName ?? messages.team.unnamed}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="role">
          {(field) => <RoleField id="member-role" value={field.state.value} onChange={field.handleChange} />}
        </form.Field>
        <form.Field name="branchIds">
          {(field) => (
            <BranchChoiceField
              id="member-branches"
              branches={branches}
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.role}>
          {(selectedRole) =>
            selectedRole === "staff" ? (
              <form.Field name="canReviewDeposits">
                {(field) => (
                  <div className="flex flex-col gap-1">
                    <Label className="flex min-h-11 items-center gap-3 text-base font-normal">
                      <Checkbox
                        checked={field.state.value}
                        onCheckedChange={(checked) => field.handleChange(checked === true)}
                      />
                      {messages.team.canReviewDeposits}
                    </Label>
                    <p className="text-sm text-muted-foreground">{messages.team.canReviewDepositsHint}</p>
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
        <FormErrorAlert error={update.error} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {messages.team.save}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </TaskSheet>
  );
}

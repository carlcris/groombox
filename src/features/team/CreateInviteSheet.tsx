import { useState } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { BranchChoiceField } from "@/features/team/BranchChoiceField";
import { memberAssignmentSchema, type AssignableRole } from "@/features/team/member-schemas";
import { RoleField } from "@/features/team/RoleField";
import { staffQueryKey, unlinkedStaffQueryOptions } from "@/features/staff/staff-queries";
import { createInvite, inviteLink, teamQueryKey } from "@/features/team/team-queries";
import { messages } from "@/lib/messages";

const noStaffProfile = "none";
const inviteSchema = memberAssignmentSchema.pick({ role: true, branchIds: true }).extend({ staffId: z.string() });

export function CreateInviteSheet({
  organizationId,
  branches,
  open,
  onOpenChange,
}: {
  organizationId: string;
  branches: WorkBranch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const unlinkedStaff = useQuery({ ...unlinkedStaffQueryOptions(organizationId), enabled: open });
  const create = useMutation({
    mutationFn: createInvite,
    onSuccess: async ({ code }) => {
      setCreatedCode(code);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: teamQueryKey(organizationId) }),
        queryClient.invalidateQueries({ queryKey: staffQueryKey(organizationId) }),
      ]);
    },
  });
  const defaultValues: { role: AssignableRole; branchIds: string[]; staffId: string } = {
    role: "staff",
    staffId: noStaffProfile,
    branchIds: branches.length === 1 && branches[0] ? [branches[0].id] : [],
  };
  const form = useForm({
    defaultValues,
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: inviteSchema },
    onSubmit: async ({ value }) => {
      await create
        .mutateAsync({
          organizationId,
          role: value.role,
          branchIds: value.branchIds,
          staffId: value.staffId === noStaffProfile ? null : value.staffId,
        })
        .catch(() => undefined);
    },
  });

  function close(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setCreatedCode(null);
      create.reset();
      form.reset();
    }
  }

  return (
    <TaskSheet
      open={open}
      onOpenChange={close}
      title={createdCode ? messages.team.inviteReady : messages.team.createInviteTitle}
      description={createdCode ? messages.team.inviteReadyBody : messages.team.createInviteIntro}
    >
      {createdCode ? (
        <div className="flex flex-col gap-4">
          <Input readOnly value={inviteLink(createdCode)} aria-label={messages.team.inviteReady} onFocus={(event) => event.target.select()} />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(inviteLink(createdCode)).then(() => toast.success(messages.team.linkCopied));
            }}
          >
            <Copy aria-hidden />
            {messages.team.copyLink}
          </Button>
          <Button onClick={() => close(false)}>{messages.team.done}</Button>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="role">
            {(field) => <RoleField id="invite-role" value={field.state.value} onChange={field.handleChange} />}
          </form.Field>
          <form.Field name="branchIds">
            {(field) => (
              <BranchChoiceField
                id="invite-branches"
                branches={branches}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          {unlinkedStaff.data && unlinkedStaff.data.length > 0 ? (
            <form.Field name="staffId">
              {(field) => (
                <FormField id="invite-staff" label={messages.staff.inviteFor} hint={messages.staff.inviteForHint}>
                  <Select value={field.state.value} onValueChange={field.handleChange}>
                    <SelectTrigger id="invite-staff">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={noStaffProfile} className="min-h-11 text-base">{messages.staff.noLogin}</SelectItem>
                      {unlinkedStaff.data.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id} className="min-h-11 text-base">
                          {profile.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </form.Field>
          ) : null}
          <FormErrorAlert error={create.error} />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {messages.team.createInvite}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </TaskSheet>
  );
}

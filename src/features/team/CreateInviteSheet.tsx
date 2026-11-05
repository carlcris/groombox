import { useState } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { BranchChoiceField } from "@/features/team/BranchChoiceField";
import { memberAssignmentSchema, type AssignableRole } from "@/features/team/member-schemas";
import { RoleField } from "@/features/team/RoleField";
import { createInvite, inviteLink, teamQueryKey } from "@/features/team/team-queries";
import { messages } from "@/lib/messages";

const inviteSchema = memberAssignmentSchema.pick({ role: true, branchIds: true });

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
  const create = useMutation({
    mutationFn: createInvite,
    onSuccess: async ({ code }) => {
      setCreatedCode(code);
      await queryClient.invalidateQueries({ queryKey: teamQueryKey(organizationId) });
    },
  });
  const defaultValues: { role: AssignableRole; branchIds: string[] } = {
    role: "staff",
    branchIds: branches.length === 1 && branches[0] ? [branches[0].id] : [],
  };
  const form = useForm({
    defaultValues,
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: inviteSchema },
    onSubmit: async ({ value }) => {
      await create.mutateAsync({ organizationId, role: value.role, branchIds: value.branchIds }).catch(() => undefined);
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
